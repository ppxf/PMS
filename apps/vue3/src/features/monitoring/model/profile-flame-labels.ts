import type { FlameFrame } from './profile-flamegraph'

export interface LabeledFlameFrame {
  frame: FlameFrame
  index: number
  x: number
  y: number
  width: number
  label: { x: number; y: number; width: number; height: number; lines: string[]; outside: boolean }
}

/** Keep proportional bars; place overflowing full names in non-overlapping label lanes. */
export function profileFlameLabels(
  frames: FlameFrame[],
  duration: number,
  width: number,
  measure: (text: string) => number,
) {
  const rows = new Map<number, { frame: FlameFrame; index: number }[]>()
  frames.forEach((frame, index) => {
    const row = rows.get(frame.depth) ?? []
    row.push({ frame, index })
    rows.set(frame.depth, row)
  })
  const items: LabeledFlameFrame[] = []
  let y = 0
  for (const [, row] of [...rows].sort(([a], [b]) => a - b)) {
    const outside: LabeledFlameFrame[] = []
    for (const { frame, index } of row) {
      const x = (frame.start / (duration || 1)) * width
      const barWidth = (frame.totalMs / (duration || 1)) * width
      const full = `${frame.name} · ${frame.totalMs.toFixed(2)} ms`
      const fits = measure(frame.name) + 12 <= barWidth
      const text = fits && measure(full) + 12 > barWidth ? frame.name : full
      const labelWidth = fits ? barWidth : Math.min(width - 12, measure(text) + 12)
      const lines: string[] = []
      let line = ''
      for (const char of text) {
        if (line && measure(line + char) > labelWidth - 12) {
          lines.push(line)
          line = ''
        }
        line += char
      }
      if (line) lines.push(line)
      const label = {
        x: fits
          ? x
          : Math.max(6, Math.min(width - labelWidth - 6, x + barWidth / 2 - labelWidth / 2)),
        y,
        width: labelWidth,
        height: fits ? 29 : lines.length * 16 + 12,
        lines,
        outside: !fits,
      }
      const item = { frame, index, x, y, width: barWidth, label }
      items.push(item)
      if (!fits) outside.push(item)
    }
    const lanes: { right: number; height: number; items: LabeledFlameFrame[] }[] = []
    for (const item of outside.sort((a, b) => a.label.x - b.label.x)) {
      let lane = lanes.find((lane) => lane.right + 8 <= item.label.x)
      if (!lane) {
        lane = { right: 0, height: 0, items: [] }
        lanes.push(lane)
      }
      lane.right = item.label.x + item.label.width
      lane.height = Math.max(lane.height, item.label.height)
      lane.items.push(item)
    }
    let labelY = y + 36
    for (const lane of lanes) {
      for (const item of lane.items) item.label.y = labelY
      labelY += lane.height + 6
    }
    y = lanes.length ? labelY + 4 : y + 32
  }
  return { items, height: Math.max(80, y) }
}

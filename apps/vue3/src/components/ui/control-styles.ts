// Shared by text inputs, selection triggers and searchable selection menus.
export const controlStyles =
  'border-input bg-background text-foreground dark:bg-input/30 h-9 min-w-0 rounded-md border px-2.5 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:ring-3 disabled:cursor-not-allowed disabled:opacity-50'
export const menuStyles =
  'bg-popover text-popover-foreground rounded-md shadow-md ring-1 ring-foreground/10 z-50'
export const optionStyles =
  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50'

export function safeRequestUrl(value: string | undefined): string {
 const path = value ?? '/';
 return path.split('?')[0];
}

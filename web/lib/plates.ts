export function normalizePlate(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "")
}

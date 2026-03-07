const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short",
})

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not available"
  }

  return dateFormatter.format(new Date(value))
}

export function formatCoordinate(value: number | null | undefined) {
  if (value == null) {
    return "Unknown"
  }

  return value.toFixed(5)
}

export function formatPlate(value: string) {
  if (!value) {
    return "Unknown"
  }

  const normalized = value.replace(/\s+/g, "").toUpperCase()
  if (normalized.length <= 3) {
    return normalized
  }

  return `${normalized.slice(0, 3)} ${normalized.slice(3)}`
}

export function formatRelativeStatusDate(value: string | null | undefined) {
  if (!value) {
    return "Never"
  }

  const timestamp = new Date(value).getTime()
  const deltaMinutes = Math.round((Date.now() - timestamp) / 60000)

  if (deltaMinutes < 1) {
    return "Just now"
  }
  if (deltaMinutes < 60) {
    return `${deltaMinutes} min ago`
  }

  const deltaHours = Math.round(deltaMinutes / 60)
  if (deltaHours < 24) {
    return `${deltaHours} hr ago`
  }

  return formatDateTime(value)
}

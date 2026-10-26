/** picocolors emits colour whenever CI is set, so assertions on captured output strip it first. */
export function plain(lines) {
  return lines.join('\n').replace(/\x1b\[[0-9;]*m/g, '')
}

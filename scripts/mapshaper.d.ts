declare module 'mapshaper' {
  const mapshaper: {
    runCommands(commands: string): Promise<void>
    // Runs commands against in-memory inputs (keyed by the file names used in -i) and returns -o outputs by file name.
    applyCommands(commands: string, input: Record<string, unknown>): Promise<Record<string, string | Buffer>>
  }
  export default mapshaper
}

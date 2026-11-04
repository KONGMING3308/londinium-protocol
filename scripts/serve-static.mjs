import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] ?? 'dist'
const port = Number(process.argv[3] ?? 5180)

createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0]
  const file = url === '/' ? '/index.html' : url
  try {
    const body = readFileSync(join(root, file))
    const type = file.endsWith('.html')
      ? 'text/html; charset=utf-8'
      : file.endsWith('.js')
        ? 'text/javascript'
        : file.endsWith('.css')
          ? 'text/css'
          : 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': type })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}/`))

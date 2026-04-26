const express=require('express')
const axios=require('axios')
const cors=require('cors')

const app=express()
app.use(cors())
app.use(express.json())

/**
 * =========================
 * 🔥 STREAMING ENDPOINT
 * =========================
 * Handles: /api/chat/stream
 */
app.post('/api/chat/stream', async (req, res) => {
  try {
    const r = await axios({
      method: 'POST',
      url: 'http://flask:5000/chat/stream',
      headers: {
        Authorization: req.headers.authorization || '',
        'Content-Type': 'application/json'
      },
      data: req.body,
      responseType: 'stream'   // ✅ CRITICAL
    })

    // ✅ Forward streaming headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    // ✅ Pipe stream directly
    r.data.on('data', chunk => {
      res.write(chunk)
    })

    r.data.on('end', () => {
      res.end()
    })

    r.data.on('error', err => {
      console.error('STREAM ERROR:', err.message)
      res.end()
    })

  } catch (err) {
    console.error('STREAM API ERROR:', err.message)

    if (err.response) {
      res.status(err.response.status).json(err.response.data)
    } else {
      res.status(500).json({ error: 'Streaming proxy error' })
    }
  }
})


/**
 * =========================
 * ✅ NORMAL API (NON-STREAM)
 * =========================
 */
app.use('/api', async (req, res) => {
  try {
    const path = req.originalUrl.replace('/api', '')

    const r = await axios({
      method: req.method,              // ✅ supports GET, POST, etc.
      url: `http://flask:5000${path}`,
      headers: {
        Authorization: req.headers.authorization || '',
        'Content-Type': 'application/json'
      },
      data: req.method !== 'GET' ? req.body : undefined,
      params: req.method === 'GET' ? req.query : undefined
    })

    res.status(r.status).json(r.data)

  } catch (err) {
    console.error('API ERROR:', err.message)

    if (err.response) {
      // Flask returned error (like 401)
      res.status(err.response.status).json(err.response.data)
    } else {
      // network or crash
      res.status(500).json({ error: 'Node proxy error' })
    }
  }
})

app.listen(8000, '0.0.0.0', () => {
  console.log('Server running on port 8000')
})
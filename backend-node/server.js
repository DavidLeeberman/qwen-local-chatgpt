const express=require('express')
const axios=require('axios')
const cors=require('cors')

const app=express()
app.use(cors())
app.use(express.json())

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
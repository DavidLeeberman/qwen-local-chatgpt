const express=require('express')
const axios=require('axios')
const cors=require('cors')

const app=express()
app.use(cors())
app.use(express.json())

app.post('/api/*', async (req, res) => {
  try {
    const path = req.path.replace('/api', '')

    const r = await axios.post(
      `http://flask:5000${path}`,
      req.body,
      {
        headers: { Authorization: req.headers.authorization }
      }
    )

    res.json(r.data)

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
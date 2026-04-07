const express=require('express')
const axios=require('axios')
const cors=require('cors')

const app=express()
app.use(cors())
app.use(express.json())

app.post('/api/*', async (req,res)=>{
  const path=req.path.replace('/api','')
  const r=await axios.post(`http://flask:5000${path}`, req.body,{
    headers:{Authorization:req.headers.authorization}
  })
  res.json(r.data)
})

app.listen(3001)
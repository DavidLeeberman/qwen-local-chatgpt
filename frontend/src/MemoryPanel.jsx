export default function MemoryPanel({memory}){
  return(<div>{memory.map((m,i)=>(<div key={i}>{m}</div>))}</div>)
}
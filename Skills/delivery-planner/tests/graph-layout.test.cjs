const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const graph=require('../assets/templates/graph-layout.js');
const html=fs.readFileSync(path.join(__dirname,'../../../Plans/north-star-platform/delivery_plan.html'),'utf8');
const plan=JSON.parse(html.match(/<script type="application\/json" id="plan-data">([\s\S]*?)<\/script>/)[1]).data;
const heights=Object.fromEntries(plan.milestones.map((m,i)=>[m.id,90+(i%4)*24]));
const build=(items=plan.milestones,width=1350)=>graph.layout(plan.periods,plan.streams,items,heights,width,plan.dependencies);
const intersects=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
function segmentHits(a,b,r){return a.x===b.x ? a.x>r.x&&a.x<r.x+r.width&&Math.max(a.y,b.y)>r.y&&Math.min(a.y,b.y)<r.y+r.height : a.y>r.y&&a.y<r.y+r.height&&Math.max(a.x,b.x)>r.x&&Math.min(a.x,b.x)<r.x+r.width;}

test('date-based layout is deterministic, within periods and lanes, without collisions',()=>{
 for(const width of [360,1350,1800]){
  const result=build(plan.milestones,width);assert.deepEqual(result,build(plan.milestones,width));
  for(const n of result.nodes){
   const m=plan.milestones.find(m=>m.id===n.id),pi=plan.periods.findIndex(p=>p.id===m.target_period),lane=result.lanes.find(l=>l.id===m.stream);
   assert(n.x>=pi*result.periodWidth&&n.x+n.width<=(pi+1)*result.periodWidth);
   assert(n.y>=lane.y+54&&n.y+n.height<=lane.y+lane.height);
   assert(result.nodes.every(other=>other===n||!intersects(n,other)));
  }
 }
});
test('all maintained dependencies have finite routes that avoid unrelated cards',()=>{
 const result=build();
 for(const edge of plan.dependencies){
  const from=result.nodes.find(n=>n.id===edge.from),to=result.nodes.find(n=>n.id===edge.to);
  const points=graph.route(from,to,result.nodes,result.width,result.height);
  assert(points.length>=2,`${edge.from} to ${edge.to}`);
  assert.deepEqual(points,graph.route(from,to,result.nodes,result.width,result.height));
  assert(!/NaN|Infinity/.test(graph.path(points)));
  for(let i=1;i<points.length;i++)for(const n of result.nodes.filter(n=>n!==from&&n!==to))assert(!segmentHits(points[i-1],points[i],n),`route crosses ${n.id}`);
 }
});
test('dense single-period nodes, undated milestones and soft cycles remain collision-free',()=>{
 const items=Array.from({length:18},(_,i)=>({...plan.milestones[0],id:`n${i}`,target_date:undefined}));
 const result=graph.layout(plan.periods,plan.streams,items,{},900,[{from:'n0',to:'n1',kind:'enables'},{from:'n1',to:'n0',kind:'enables'}]);
 assert.equal(result.nodes.length,18);
 result.nodes.forEach(n=>assert(result.nodes.every(o=>o===n||!intersects(n,o))));
});
test('empty and filtered graphs remain bounded and retain stream labels',()=>{
 const empty=build([]);assert.equal(empty.nodes.length,0);assert.equal(empty.lanes.length,plan.streams.length);assert(Number.isFinite(empty.height));
 const selected=plan.milestones.filter(m=>m.epic_ids.includes('PLAT-201'));
 assert.equal(build(selected).nodes.length,3);
});
test('date changes move a node within its period without changing source data',()=>{
 const source=JSON.stringify(plan),m=plan.milestones[0],p=plan.periods.find(p=>p.id===m.target_period);
 const a=build([{...m,target_date:p.start}]).nodes[0],b=build([{...m,target_date:p.end}]).nodes[0];
 assert(a.x<b.x);assert.equal(JSON.stringify(plan),source);
});

/* Pure geometry shared by the portable renderer and Node regression tests. */
const PlannerGraph = (() => {
  const CARD_WIDTH = 218, GAP = 36, HEADER = 58;
  function layout(periods, streams, items, heights, width, dependencies = []) {
    const periodWidth = Math.max(400, width / periods.length);
    const nodes = [], lanes = [];
    let top = HEADER;
    for (const stream of streams) {
      const entries = items.filter(m => m.stream === stream.id);
      const positions = [];
      for (let pi = 0; pi < periods.length; pi++) {
        const p = periods[pi], group = entries.filter(m => m.target_period === p.id);
        // Date order first; source order breaks ties and supplies undated positions.
        group.sort((a,b) => (a.target_date || p.end).localeCompare(b.target_date || p.end));
        group.forEach((m,index) => {
          const fraction = m.target_date ? (Date.parse(m.target_date)-Date.parse(p.start)) / Math.max(1,Date.parse(p.end)-Date.parse(p.start)) : (index+1)/(group.length+1);
          const x = pi*periodWidth + 24 + fraction*(periodWidth-CARD_WIDTH-48);
          const height = heights[m.id] || 110;
          const parents = dependencies.filter(e=>e.kind!=='relates_to' && e.to===m.id).map(e=>positions.find(n=>n.id===e.from)).filter(Boolean);
          let y = top + 54 + (parents.length ? Math.min(...parents.map(n=>n.y-top-54)) : (index%2)*24);
          // Packing only moves downward; varying measured text heights cannot overlap.
          for (const other of [...positions].sort((a,b)=>a.y-b.y)) {
            if (x < other.x+CARD_WIDTH+GAP && x+CARD_WIDTH+GAP > other.x && y < other.y+other.height+GAP && y+height+GAP > other.y) y=other.y+other.height+GAP;
          }
          positions.push({id:m.id,x,y,width:CARD_WIDTH,height,stream:stream.id});
        });
      }
      const bottom = Math.max(top+110,...positions.map(n=>n.y+n.height+32));
      lanes.push({id:stream.id,y:top,height:bottom-top});
      nodes.push(...positions);top=bottom;
    }
    return {nodes,lanes,width:periodWidth*periods.length,height:top+16,periodWidth};
  }
  const inside = (p,r) => p.x>r.x && p.x<r.x+r.width && p.y>r.y && p.y<r.y+r.height;
  function blocked(a,b,rects) {
    return rects.some(r=>a.x===b.x ? a.x>r.x && a.x<r.x+r.width && Math.max(a.y,b.y)>r.y && Math.min(a.y,b.y)<r.y+r.height : a.y>r.y && a.y<r.y+r.height && Math.max(a.x,b.x)>r.x && Math.min(a.x,b.x)<r.x+r.width);
  }
  function route(from,to,nodes,width,height) {
    // Prefer vertical ports when nodes overlap in time; otherwise use side ports.
    const vertical = Math.min(from.x+from.width,to.x+to.width)-Math.max(from.x,to.x)>0;
    const forward = vertical ? to.y>from.y : to.x>from.x;
    const port = (n,out) => vertical ? {x:n.x+n.width/2,y:n.y+((out===forward)?n.height:0)} : {x:n.x+((out===forward)?n.width:0),y:n.y+n.height/2};
    const a=port(from,true),b=port(to,false), sign=forward?1:-1;
    const start={x:a.x+(vertical?0:sign*16),y:a.y+(vertical?sign*16:0)};
    const end={x:b.x-(vertical?0:sign*16),y:b.y-(vertical?sign*16:0)};
    const rects=nodes.map(n=>({x:n.x-8,y:n.y-8,width:n.width+16,height:n.height+16}));
    const xs=[...new Set([8,width-8,start.x,end.x,...rects.flatMap(r=>[r.x,r.x+r.width])])].sort((a,b)=>a-b);
    const ys=[...new Set([HEADER+8,height-8,start.y,end.y,...rects.flatMap(r=>[r.y,r.y+r.height])])].sort((a,b)=>a-b);
    const nx=xs.length, index=(x,y)=>ys.indexOf(y)*nx+xs.indexOf(x), point=i=>({x:xs[i%nx],y:ys[Math.floor(i/nx)]});
    const source=index(start.x,start.y),target=index(end.x,end.y),cost=new Map([[source,0]]),prev=new Map(),heap=[];
    function push(item) {heap.push(item);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].f<=item.f)break;heap[i]=heap[p];i=p;}heap[i]=item;}
    function pop(){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;}
    push({id:source,g:0,f:0});
    while(heap.length){
      const current=pop();if(current.g!==cost.get(current.id))continue;if(current.id===target)break;
      const i=current.id,p=point(i),xi=i%nx,yi=Math.floor(i/nx);
      const neighbours=[xi?i-1:-1,xi<nx-1?i+1:-1,yi?i-nx:-1,yi<ys.length-1?i+nx:-1].filter(v=>v>=0);
      for(const next of neighbours){const q=point(next);if(rects.some(r=>inside(q,r))||blocked(p,q,rects))continue;
        const g=current.g+Math.abs(q.x-p.x)+Math.abs(q.y-p.y);
        if(g>=(cost.get(next)??Infinity))continue;
        cost.set(next,g);prev.set(next,i);push({id:next,g,f:g+Math.abs(q.x-end.x)+Math.abs(q.y-end.y)});
      }
    }
    if(!cost.has(target))return []; // Never draw a misleading line through a card.
    const middle=[];for(let i=target;i!==undefined;i=prev.get(i))middle.push(point(i));middle.reverse();
    const result=[];
    for(const p of [a,...middle,b]){if(result.length&&result[result.length-1].x===p.x&&result[result.length-1].y===p.y)continue;
      while(result.length>1){const q=result[result.length-1],r=result[result.length-2];if((r.x===q.x&&q.x===p.x)||(r.y===q.y&&q.y===p.y))result.pop();else break;}result.push(p);}
    return result;
  }
  function path(points) {
    if(!points.length)return '';
    let d=`M ${points[0].x} ${points[0].y}`;
    for(let i=1;i<points.length-1;i++){
      const a=points[i-1],b=points[i],c=points[i+1],ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),r=Math.min(6,ab/2,bc/2);
      d+=` L ${b.x+(a.x-b.x)*r/ab} ${b.y+(a.y-b.y)*r/ab} Q ${b.x} ${b.y} ${b.x+(c.x-b.x)*r/bc} ${b.y+(c.y-b.y)*r/bc}`;
    }
    const end=points[points.length-1];return d+` L ${end.x} ${end.y}`;
  }
  return {layout,route,path};
})();
if (typeof module !== 'undefined') module.exports = PlannerGraph;

type Bucket={windowStart:number;count:number};
const buckets=new Map<string,Bucket>();
const WINDOW_MS=60_000;
const MAX_KEYS=5000;

function clientKey(request:Request,scope:string){
  const forwarded=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const real=request.headers.get('x-real-ip')?.trim();
  return `${scope}:${forwarded||real||'unknown'}`;
}

export function consumeRateLimit(request:Request,scope:string,limit:number){
  const now=Date.now();
  const key=clientKey(request,scope);
  const current=buckets.get(key);
  if(!current||now-current.windowStart>=WINDOW_MS){
    buckets.set(key,{windowStart:now,count:1});
  }else{
    current.count+=1;
    if(current.count>limit){
      const retryAfter=Math.max(1,Math.ceil((WINDOW_MS-(now-current.windowStart))/1000));
      return {allowed:false,retryAfter};
    }
  }
  if(buckets.size>MAX_KEYS){
    for(const [k,v] of buckets){if(now-v.windowStart>=WINDOW_MS)buckets.delete(k);if(buckets.size<=MAX_KEYS)break;}
  }
  return {allowed:true,retryAfter:0};
}

export function tooLarge(request:Request,maxBytes:number){
  const length=Number(request.headers.get('content-length'));
  return Number.isFinite(length)&&length>maxBytes;
}

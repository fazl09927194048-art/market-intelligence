import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return { name:'Market/Intel', short_name:'MarketIntel', description:'Live market and news intelligence', start_url:'/', display:'standalone', background_color:'#06080c', theme_color:'#06080c', icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any maskable'}] };
}

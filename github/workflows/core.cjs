// このファイルは index.html の判定ロジック(/*CORE-START*/〜/*CORE-END*/)をそのまま写したものです。
// アプリとサーバーで同じ結果になるよう、手で編集せずに index.html から作り直してください。

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function hashStr(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function gauss(r){var u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
var TF_MS={'15min':900000,'1h':3600000,'4h':14400000};
var BASE={'USD/JPY':153.2,'EUR/JPY':166.4,'GBP/JPY':195.1,'AUD/JPY':99.6,'EUR/USD':1.0862,'GBP/USD':1.2741};
var DEC={'USD/JPY':3,'EUR/JPY':3,'GBP/JPY':3,'AUD/JPY':3,'EUR/USD':5,'GBP/USD':5};
var DEMO_SALT=189;

function sma(v,n){var o=new Array(v.length).fill(null),s=0;for(var i=0;i<v.length;i++){s+=v[i];if(i>=n)s-=v[i-n];if(i>=n-1)o[i]=s/n;}return o;}
function ema(v,n){var o=new Array(v.length).fill(null),k=2/(n+1),prev=null;for(var i=0;i<v.length;i++){if(i===n-1){var s=0;for(var j=0;j<n;j++)s+=v[j];prev=s/n;o[i]=prev;}else if(i>=n){prev=v[i]*k+prev*(1-k);o[i]=prev;}}return o;}
function rsi(v,n){n=n||14;var o=new Array(v.length).fill(null);if(v.length<=n)return o;var g=0,l=0,i,d;for(i=1;i<=n;i++){d=v[i]-v[i-1];if(d>=0)g+=d;else l-=d;}g/=n;l/=n;o[n]=l===0?100:100-100/(1+g/l);for(i=n+1;i<v.length;i++){d=v[i]-v[i-1];g=(g*(n-1)+(d>0?d:0))/n;l=(l*(n-1)+(d<0?-d:0))/n;o[i]=l===0?100:100-100/(1+g/l);}return o;}
function macd(v){var e12=ema(v,12),e26=ema(v,26);var line=v.map(function(_,i){return e12[i]!==null&&e26[i]!==null?e12[i]-e26[i]:null;});var first=line.findIndex(function(x){return x!==null;});var sig=new Array(v.length).fill(null);if(first>=0){var part=line.slice(first),s=ema(part,9);for(var i=0;i<part.length;i++)sig[first+i]=s[i];}var hist=line.map(function(x,i){return x!==null&&sig[i]!==null?x-sig[i]:null;});return{line:line,sig:sig,hist:hist};}
function bb(v,n,k){n=n||20;k=k||2;var m=sma(v,n),up=[],lo=[];for(var i=0;i<v.length;i++){if(m[i]===null){up.push(null);lo.push(null);continue;}var s=0;for(var j=i-n+1;j<=i;j++)s+=(v[j]-m[i])*(v[j]-m[i]);var sd=Math.sqrt(s/n);up.push(m[i]+k*sd);lo.push(m[i]-k*sd);}return{mid:m,up:up,lo:lo};}

var IND_NAME={ma:'移動平均クロス',macd:'MACD',rsi:'RSI',bb:'ボリンジャー'};
function analyze(closes,cfg){
  var n=closes.length;
  var f=sma(closes,9),s=sma(closes,21),m=macd(closes),r=rsi(closes,14),b=bb(closes,20,2);
  var ev=[],from=Math.max(1,n-cfg.window);
  for(var i=from;i<n;i++){
    if(cfg.ind.ma&&f[i]!==null&&s[i]!==null&&f[i-1]!==null&&s[i-1]!==null){
      if(f[i-1]<=s[i-1]&&f[i]>s[i])ev.push({ind:'ma',dir:1,idx:i});
      if(f[i-1]>=s[i-1]&&f[i]<s[i])ev.push({ind:'ma',dir:-1,idx:i});
    }
    if(cfg.ind.macd&&m.hist[i]!==null&&m.hist[i-1]!==null){
      if(m.hist[i-1]<=0&&m.hist[i]>0)ev.push({ind:'macd',dir:1,idx:i});
      if(m.hist[i-1]>=0&&m.hist[i]<0)ev.push({ind:'macd',dir:-1,idx:i});
    }
    if(cfg.ind.rsi&&r[i]!==null&&r[i-1]!==null){
      if(r[i-1]<30&&r[i]>=30)ev.push({ind:'rsi',dir:1,idx:i});
      if(r[i-1]>70&&r[i]<=70)ev.push({ind:'rsi',dir:-1,idx:i});
    }
    if(cfg.ind.bb&&b.lo[i]!==null&&b.lo[i-1]!==null){
      if(closes[i-1]<b.lo[i-1]&&closes[i]>=b.lo[i])ev.push({ind:'bb',dir:1,idx:i});
      if(closes[i-1]>b.up[i-1]&&closes[i]<=b.up[i])ev.push({ind:'bb',dir:-1,idx:i});
    }
  }
  function uniq(d){var set={};ev.forEach(function(e){if(e.dir===d)set[e.ind]=1;});return Object.keys(set);}
  var bi=uniq(1),si=uniq(-1),signal=null;
  if(bi.length>si.length&&bi.length>=cfg.minStrength)signal={dir:1,strength:bi.length,inds:bi};
  else if(si.length>bi.length&&si.length>=cfg.minStrength)signal={dir:-1,strength:si.length,inds:si};
  if(signal){signal.idx=Math.max.apply(null,ev.filter(function(e){return e.dir===signal.dir;}).map(function(e){return e.idx;}));}
  var L=n-1,c=closes[L];
  var states={
    ma:f[L]!==null&&s[L]!==null?(f[L]>s[L]?1:-1):0,
    macd:m.hist[L]!==null?(m.hist[L]>=0?1:-1):0,
    rsi:r[L],
    bb:b.up[L]===null?0:(c>b.up[L]?-1:(c<b.lo[L]?1:0))
  };
  return{signal:signal,states:states,slow:s,events:ev};
}

function demoStep(st,t){
  if(st.left<=0){st.drift=gauss(st.rng)*st.vol*0.6;st.left=14+Math.floor(st.rng()*26);}
  st.left--;
  var o=st.price,c=o+st.drift+gauss(st.rng)*st.vol;
  var h=Math.max(o,c)+Math.abs(gauss(st.rng))*st.vol*0.4,l=Math.min(o,c)-Math.abs(gauss(st.rng))*st.vol*0.4;
  st.price=c;st.bars.push({t:t,o:o,h:h,l:l,c:c});if(st.bars.length>200)st.bars.shift();
}
function demoNew(pair,tf,now){
  var rng=mulberry32(hashStr(pair)+DEMO_SALT),ms=TF_MS[tf],base=BASE[pair];
  var st={rng:rng,ms:ms,price:base,drift:0,left:0,bars:[],vol:base*0.00045};
  var last=Math.floor(now/ms)*ms;
  for(var i=119;i>=0;i--)demoStep(st,last-i*ms);
  return st;
}

module.exports = { analyze: analyze, IND_NAME: IND_NAME, DEC: DEC, TF_MS: TF_MS };

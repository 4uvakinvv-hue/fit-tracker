const R=6371;
function haversineKm(a,b){
  const lat1=Number(a?.lat),lat2=Number(b?.lat),lng1=Number(a?.lng),lng2=Number(b?.lng);
  if(![lat1,lat2,lng1,lng2].every(Number.isFinite))return 0;
  const p=Math.PI/180,dLat=(lat2-lat1)*p,dLng=(lng2-lng1)*p;
  const s=Math.sin(dLat/2)**2+Math.cos(lat1*p)*Math.cos(lat2*p)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(s)));
}

export function gpsTrustPolicy(type='bike'){
  if(type==='run')return {maxSpeedKmh:45,maxAccuracyM:80,gapSeconds:600,recoveryRadiusKm:.6};
  if(type==='bike')return {maxSpeedKmh:95,maxAccuracyM:90,gapSeconds:600,recoveryRadiusKm:1.2};
  if(type==='moto')return {maxSpeedKmh:280,maxAccuracyM:110,gapSeconds:900,recoveryRadiusKm:3};
  if(type==='hike')return {maxSpeedKmh:220,maxAccuracyM:110,gapSeconds:1200,recoveryRadiusKm:2};
  if(type==='flaneuring')return {maxSpeedKmh:320,maxAccuracyM:120,gapSeconds:1200,recoveryRadiusKm:3};
  return {maxSpeedKmh:120,maxAccuracyM:100,gapSeconds:600,recoveryRadiusKm:1.5};
}
function normalizeGpsPoint(p){
  if(!p)return null;
  const lat=Number(p.lat),lng=Number(p.lng),t=Number(p.t);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||!Number.isFinite(t))return null;
  const accuracy=p.accuracy==null?null:Number(p.accuracy);
  const speedKmh=p.speedKmh==null?null:Number(p.speedKmh);
  return {...p,lat,lng,t,accuracy:Number.isFinite(accuracy)?accuracy:null,speedKmh:Number.isFinite(speedKmh)?Math.max(0,speedKmh):null};
}
export function gpsSegmentAssessment(a,b,type='bike'){
  const policy=gpsTrustPolicy(type);
  const dt=(Number(b.t)-Number(a.t))/1000;
  if(!Number.isFinite(dt)||dt<=0)return {trusted:false,reason:'time',dt:0,km:0,derivedSpeed:0,deviceSpeed:null,longGap:false};
  const km=haversineKm(a,b),derivedSpeed=km/(dt/3600);
  const deviceSpeed=Number.isFinite(Number(b.speedKmh))?Math.max(0,Number(b.speedKmh)):null;
  const poorAccuracy=(Number.isFinite(Number(b.accuracy))&&Number(b.accuracy)>policy.maxAccuracyM);
  const impossibleSpeed=derivedSpeed>policy.maxSpeedKmh;
  const deviceImpossible=deviceSpeed!=null&&deviceSpeed>policy.maxSpeedKmh*1.15;
  const speedMismatch=deviceSpeed!=null&&derivedSpeed>80&&deviceSpeed<Math.max(25,derivedSpeed*.35);
  const teleport=dt<60&&km>Math.max(1.5,policy.maxSpeedKmh*dt/3600*1.35);
  return {
    trusted:!poorAccuracy&&!impossibleSpeed&&!deviceImpossible&&!speedMismatch&&!teleport,
    reason:poorAccuracy?'accuracy':impossibleSpeed||deviceImpossible?'speed':speedMismatch?'mismatch':teleport?'jump':'ok',
    dt,km,derivedSpeed,deviceSpeed,
    longGap:dt>policy.gapSeconds
  };
}
export function sanitizeGpsPoints(points=[],type='bike'){
  const policy=gpsTrustPolicy(type);
  const source=(points||[]).map(normalizeGpsPoint).filter(Boolean).sort((a,b)=>a.t-b.t);
  if(!source.length)return {points:[],filteredPoints:0,discontinuities:0,spoofDetected:false};
  const out=[];
  let filteredPoints=0,discontinuities=0,spoofDetected=false,pending=[],lastAccepted=null;
  const accept=(p,breakBefore=false)=>{
    const next={...p};
    if(breakBefore)next.breakBefore=true;
    out.push(next);lastAccepted=next;
  };

  for(const p of source){
    if(!lastAccepted){
      if(p.accuracy!=null&&p.accuracy>policy.maxAccuracyM){filteredPoints++;continue;}
      accept(p);continue;
    }
    const assessment=gpsSegmentAssessment(lastAccepted,p,type);
    if(assessment.longGap){
      if(p.accuracy!=null&&p.accuracy>policy.maxAccuracyM){filteredPoints++;spoofDetected=true;continue;}
      if(pending.length)filteredPoints+=pending.length;
      pending=[];
      accept(p,true);discontinuities++;continue;
    }
    if(assessment.trusted){
      if(pending.length){
        if(assessment.km>policy.recoveryRadiusKm){
          pending.push(p);
          if(pending.length>60){filteredPoints+=pending.length-20;pending=pending.slice(-20);}
          spoofDetected=true;
          continue;
        }
        filteredPoints+=pending.length;pending=[];spoofDetected=true;
      }
      accept(p);continue;
    }

    spoofDetected=true;
    pending.push(p);
    if(pending.length>60){filteredPoints+=pending.length-20;pending=pending.slice(-20);}
  }
  filteredPoints+=pending.length;
  return {points:out,filteredPoints,discontinuities,spoofDetected};
}

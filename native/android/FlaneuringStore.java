package ru.forma.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.location.Location;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.UUID;

public final class FlaneuringStore {
  private static final String PREFS="forma_flaneuring";
  private static final String ACTIVE="active";
  private static final String SESSION_ID="session_id";
  private static final String STARTED_AT="started_at";
  private static final String LAST_MOVE_AT="last_move_at";
  private static final String LAST_MOVE_LAT="last_move_lat";
  private static final String LAST_MOVE_LNG="last_move_lng";
  private static final String POINTS="points";
  private static final String COMPLETED="completed";
  public static final long AUTO_STOP_MS=2L*60L*60L*1000L;

  private FlaneuringStore(){}

  private static SharedPreferences prefs(Context c){return c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);}

  public static synchronized JSONObject start(Context c){
    SharedPreferences p=prefs(c);
    if(p.getBoolean(ACTIVE,false)){
      autoFinalizeIfStale(c);
      if(p.getBoolean(ACTIVE,false))return status(c);
    }
    long now=System.currentTimeMillis();
    p.edit()
      .putBoolean(ACTIVE,true)
      .putString(SESSION_ID,UUID.randomUUID().toString())
      .putLong(STARTED_AT,now)
      .putLong(LAST_MOVE_AT,now)
      .remove(LAST_MOVE_LAT).remove(LAST_MOVE_LNG)
      .putString(POINTS,"[]")
      .apply();
    return status(c);
  }

  public static synchronized JSONObject append(Context c,Location loc){
    SharedPreferences p=prefs(c);
    if(!p.getBoolean(ACTIVE,false))return status(c);
    long now=loc.getTime()>0?loc.getTime():System.currentTimeMillis();
    JSONArray points;
    try{points=new JSONArray(p.getString(POINTS,"[]"));}catch(Exception e){points=new JSONArray();}

    JSONObject point=new JSONObject();
    try{
      point.put("lat",loc.getLatitude());
      point.put("lng",loc.getLongitude());
      point.put("t",now);
      point.put("accuracy",loc.hasAccuracy()?loc.getAccuracy():JSONObject.NULL);
      point.put("speedKmh",loc.hasSpeed()?Math.max(0,loc.getSpeed()*3.6):JSONObject.NULL);
      point.put("altitude",loc.hasAltitude()?loc.getAltitude():JSONObject.NULL);
      if(android.os.Build.VERSION.SDK_INT>=26){
        point.put("altitudeAccuracy",loc.hasVerticalAccuracy()?loc.getVerticalAccuracyMeters():JSONObject.NULL);
      }
      points.put(point);
    }catch(Exception ignored){}

    long lastMoveAt=p.getLong(LAST_MOVE_AT,p.getLong(STARTED_AT,now));
    boolean hasAnchor=p.contains(LAST_MOVE_LAT)&&p.contains(LAST_MOVE_LNG);
    double lat=loc.getLatitude(),lng=loc.getLongitude();
    boolean moved=!hasAnchor;
    if(hasAnchor){
      float[] out=new float[1];
      Location.distanceBetween(p.getFloat(LAST_MOVE_LAT,0f),p.getFloat(LAST_MOVE_LNG,0f),lat,lng,out);
      float displacement=out[0];
      float speed=loc.hasSpeed()?loc.getSpeed():0f;
      moved=displacement>=40f || (displacement>=18f && speed>=0.8f);
    }

    SharedPreferences.Editor e=p.edit().putString(POINTS,points.toString());
    if(moved){
      e.putLong(LAST_MOVE_AT,now)
       .putFloat(LAST_MOVE_LAT,(float)lat)
       .putFloat(LAST_MOVE_LNG,(float)lng);
    }
    e.apply();
    return status(c);
  }

  public static synchronized boolean shouldAutoStop(Context c){
    SharedPreferences p=prefs(c);
    if(!p.getBoolean(ACTIVE,false))return false;
    long last=p.getLong(LAST_MOVE_AT,p.getLong(STARTED_AT,System.currentTimeMillis()));
    return System.currentTimeMillis()-last>=AUTO_STOP_MS;
  }

  public static synchronized JSONObject finish(Context c,boolean autoEnded){
    SharedPreferences p=prefs(c);
    if(!p.getBoolean(ACTIVE,false))return completed(c);
    long started=p.getLong(STARTED_AT,System.currentTimeMillis());
    long lastMove=p.getLong(LAST_MOVE_AT,System.currentTimeMillis());
    long ended=autoEnded?lastMove:System.currentTimeMillis();
    JSONArray source;
    try{source=new JSONArray(p.getString(POINTS,"[]"));}catch(Exception e){source=new JSONArray();}
    JSONArray trimmed=new JSONArray();
    for(int i=0;i<source.length();i++){
      JSONObject point=source.optJSONObject(i);
      if(point!=null&&point.optLong("t",0)<=ended)trimmed.put(point);
    }
    JSONObject result=new JSONObject();
    try{
      result.put("sessionId",p.getString(SESSION_ID,UUID.randomUUID().toString()));
      result.put("startedAt",started);
      result.put("endedAt",Math.max(started,ended));
      result.put("lastMoveAt",lastMove);
      result.put("autoEnded",autoEnded);
      result.put("points",trimmed);
    }catch(Exception ignored){}
    JSONArray queue=completedQueue(p);
    queue.put(result);
    p.edit()
      .putBoolean(ACTIVE,false)
      .putString(COMPLETED,queue.toString())
      .apply();
    return result;
  }

  public static synchronized JSONObject autoFinalizeIfStale(Context c){
    if(shouldAutoStop(c))return finish(c,true);
    return null;
  }

  public static synchronized JSONObject status(Context c){
    autoFinalizeIfStale(c);
    SharedPreferences p=prefs(c);
    JSONObject out=new JSONObject();
    try{
      out.put("active",p.getBoolean(ACTIVE,false));
      out.put("sessionId",p.getString(SESSION_ID,""));
      out.put("startedAt",p.getLong(STARTED_AT,0));
      out.put("lastMoveAt",p.getLong(LAST_MOVE_AT,0));
      JSONArray points=new JSONArray(p.getString(POINTS,"[]"));
      out.put("points",points);
      out.put("pointCount",points.length());
      out.put("autoStopAfterMs",AUTO_STOP_MS);
    }catch(Exception ignored){}
    return out;
  }

  private static JSONArray completedQueue(SharedPreferences p){
    String raw=p.getString(COMPLETED,null);
    if(raw==null||raw.isEmpty())return new JSONArray();
    try{
      if(raw.trim().startsWith("["))return new JSONArray(raw);
      JSONArray migrated=new JSONArray();
      migrated.put(new JSONObject(raw));
      return migrated;
    }catch(Exception e){return new JSONArray();}
  }

  public static synchronized JSONObject completed(Context c){
    autoFinalizeIfStale(c);
    JSONArray queue=completedQueue(prefs(c));
    JSONObject first=queue.optJSONObject(0);
    return first==null?new JSONObject():first;
  }

  public static synchronized void clearCompleted(Context c){clearCompleted(c,null);}

  public static synchronized void clearCompleted(Context c,String sessionId){
    SharedPreferences p=prefs(c);
    JSONArray queue=completedQueue(p);
    JSONArray rest=new JSONArray();
    boolean removed=false;
    for(int i=0;i<queue.length();i++){
      JSONObject item=queue.optJSONObject(i);
      if(item==null)continue;
      boolean match=sessionId==null?!removed:sessionId.equals(item.optString("sessionId",""));
      if(match&&!removed){removed=true;continue;}
      rest.put(item);
    }
    if(rest.length()==0)p.edit().remove(COMPLETED).apply();
    else p.edit().putString(COMPLETED,rest.toString()).apply();
  }
}

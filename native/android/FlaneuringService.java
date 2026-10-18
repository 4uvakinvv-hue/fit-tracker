package ru.forma.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;

public class FlaneuringService extends Service implements LocationListener {
  public static final String ACTION_START="ru.forma.app.flaneuring.START";
  public static final String ACTION_STOP="ru.forma.app.flaneuring.STOP";
  private static final String CHANNEL="forma_flaneuring";
  private static final int NOTIFICATION_ID=2101;
  private LocationManager locationManager;
  private final Handler handler=new Handler(Looper.getMainLooper());
  private final Runnable watchdog=new Runnable(){
    @Override public void run(){
      if(FlaneuringStore.shouldAutoStop(FlaneuringService.this)){
        finish(true);
        return;
      }
      handler.postDelayed(this,5*60*1000L);
    }
  };

  @Override public void onCreate(){
    super.onCreate();
    createChannel();
    locationManager=(LocationManager)getSystemService(LOCATION_SERVICE);
  }

  @Override public int onStartCommand(Intent intent,int flags,int startId){
    String action=intent!=null?intent.getAction():ACTION_START;
    if(ACTION_STOP.equals(action)){finish(false);return START_NOT_STICKY;}
    FlaneuringStore.autoFinalizeIfStale(this);
    if(!FlaneuringStore.status(this).optBoolean("active",false)){stopSelf();return START_NOT_STICKY;}
    startForeground(NOTIFICATION_ID,trackingNotification());
    startLocations();
    handler.removeCallbacks(watchdog);
    handler.post(watchdog);
    return START_STICKY;
  }

  private void startLocations(){
    if(locationManager==null)return;
    if(ActivityCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED &&
       ActivityCompat.checkSelfPermission(this,Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED)return;
    try{
      if(locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)){
        locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER,120000L,0f,this,Looper.getMainLooper());
      }
    }catch(Exception ignored){}
    try{
      if(locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)){
        locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,180000L,0f,this,Looper.getMainLooper());
      }
    }catch(Exception ignored){}
  }

  @Override public void onLocationChanged(Location location){
    if(location==null)return;
    if(location.hasAccuracy()&&location.getAccuracy()>100f)return;
    FlaneuringStore.append(this,location);
    if(FlaneuringStore.shouldAutoStop(this))finish(true);
  }

  private void finish(boolean auto){
    FlaneuringStore.finish(this,auto);
    handler.removeCallbacks(watchdog);
    if(locationManager!=null)locationManager.removeUpdates(this);
    if(auto){
      NotificationManager nm=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
      if(nm!=null)nm.notify(NOTIFICATION_ID+1,finishedNotification());
    }
    stopForeground(true);
    stopSelf();
  }

  private void createChannel(){
    if(Build.VERSION.SDK_INT>=26){
      NotificationManager nm=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
      if(nm!=null)nm.createNotificationChannel(new NotificationChannel(CHANNEL,"Фланирование",NotificationManager.IMPORTANCE_LOW));
    }
  }

  private PendingIntent appIntent(){
    Intent i=new Intent(this,MainActivity.class);
    i.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
    return PendingIntent.getActivity(this,0,i,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
  }

  private Notification trackingNotification(){
    return new NotificationCompat.Builder(this,CHANNEL)
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentTitle("Форма · Фланирование")
      .setContentText("Маршрут записывается офлайн. 2 часа без движения — автозавершение.")
      .setOngoing(true).setContentIntent(appIntent()).build();
  }

  private Notification finishedNotification(){
    return new NotificationCompat.Builder(this,CHANNEL)
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentTitle("Фланирование завершено")
      .setContentText("2 часа без заметного перемещения. Последние часы ожидания исключены.")
      .setAutoCancel(true).setContentIntent(appIntent()).build();
  }

  @Nullable @Override public IBinder onBind(Intent intent){return null;}
  @Override public void onProviderEnabled(String provider){}
  @Override public void onProviderDisabled(String provider){}
  @Override public void onDestroy(){
    handler.removeCallbacks(watchdog);
    if(locationManager!=null)locationManager.removeUpdates(this);
    super.onDestroy();
  }
}

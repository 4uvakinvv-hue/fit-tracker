package ru.forma.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;

import androidx.core.content.ContextCompat;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.concurrent.TimeUnit;

@CapacitorPlugin(
  name="StepCounter",
  permissions={
    @Permission(alias="activity",strings={Manifest.permission.ACTIVITY_RECOGNITION})
  }
)
public class StepCounterPlugin extends Plugin implements SensorEventListener {
  private SensorManager sensorManager;
  private Sensor sensor;
  private PluginCall pendingCall;

  @Override
  public void load(){
    sensorManager=(SensorManager)getContext().getSystemService(Context.SENSOR_SERVICE);
    sensor=sensorManager!=null?sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER):null;
    PeriodicWorkRequest request=new PeriodicWorkRequest.Builder(StepCounterWorker.class,15,TimeUnit.MINUTES).build();
    WorkManager.getInstance(getContext()).enqueueUniquePeriodicWork(
      "forma-native-step-counter",
      ExistingPeriodicWorkPolicy.UPDATE,
      request
    );
  }

  private boolean permissionGranted(){
    return Build.VERSION.SDK_INT<Build.VERSION_CODES.Q ||
      ContextCompat.checkSelfPermission(getContext(),Manifest.permission.ACTIVITY_RECOGNITION)==PackageManager.PERMISSION_GRANTED;
  }

  @PluginMethod
  public void requestPermission(PluginCall call){
    if(permissionGranted()){
      JSObject out=new JSObject();out.put("granted",true);call.resolve(out);return;
    }
    requestPermissionForAlias("activity",call,"activityPermissionCallback");
  }

  @PermissionCallback
  private void activityPermissionCallback(PluginCall call){
    JSObject out=new JSObject();out.put("granted",permissionGranted());call.resolve(out);
  }

  @PluginMethod
  public void readTodaySteps(PluginCall call){
    if(!permissionGranted()){call.reject("ACTIVITY_RECOGNITION permission required","permission_required");return;}
    if(sensorManager==null||sensor==null){call.reject("Step counter sensor unavailable","unavailable");return;}
    if(pendingCall!=null){call.reject("Step counter read already in progress","busy");return;}
    pendingCall=call;
    boolean ok=sensorManager.registerListener(this,sensor,SensorManager.SENSOR_DELAY_NORMAL);
    if(!ok){pendingCall=null;call.reject("Could not start step counter sensor","sensor_error");}
  }

  @Override
  public void onSensorChanged(SensorEvent event){
    if(event.sensor.getType()!=Sensor.TYPE_STEP_COUNTER||pendingCall==null)return;
    PluginCall call=pendingCall;
    pendingCall=null;
    sensorManager.unregisterListener(this);
    long counter=Math.max(0L,Math.round(event.values[0]));
    Integer seed=call.getInt("seedSteps",0);
    StepCounterStore.Snapshot snapshot=StepCounterStore.update(getContext(),counter,seed==null?0:seed);
    JSObject out=new JSObject();
    out.put("date",snapshot.date);
    out.put("counter",snapshot.counter);
    out.put("todaySteps",snapshot.todaySteps);
    out.put("source","android_step_counter");
    call.resolve(out);
  }

  @Override public void onAccuracyChanged(Sensor sensor,int accuracy){}

  @Override
  protected void handleOnDestroy(){
    if(sensorManager!=null)sensorManager.unregisterListener(this);
    pendingCall=null;
  }
}

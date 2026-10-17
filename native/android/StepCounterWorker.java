package ru.forma.app;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Handler;
import android.os.HandlerThread;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

public class StepCounterWorker extends Worker {
  public StepCounterWorker(@NonNull Context context,@NonNull WorkerParameters params){super(context,params);}

  @NonNull
  @Override
  public Result doWork(){
    SensorManager manager=(SensorManager)getApplicationContext().getSystemService(Context.SENSOR_SERVICE);
    if(manager==null)return Result.success();
    Sensor sensor=manager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
    if(sensor==null)return Result.success();

    HandlerThread thread=new HandlerThread("FormaStepCounterWorker");
    thread.start();
    CountDownLatch latch=new CountDownLatch(1);
    AtomicLong value=new AtomicLong(-1L);

    SensorEventListener listener=new SensorEventListener(){
      @Override public void onSensorChanged(SensorEvent event){
        if(event.sensor.getType()==Sensor.TYPE_STEP_COUNTER){
          value.set(Math.max(0L,Math.round(event.values[0])));
          latch.countDown();
        }
      }
      @Override public void onAccuracyChanged(Sensor sensor,int accuracy){}
    };

    try{
      manager.registerListener(listener,sensor,SensorManager.SENSOR_DELAY_NORMAL,new Handler(thread.getLooper()));
      latch.await(3,TimeUnit.SECONDS);
      long counter=value.get();
      if(counter>=0)StepCounterStore.update(getApplicationContext(),counter,0);
    }catch(InterruptedException e){
      Thread.currentThread().interrupt();
    }finally{
      manager.unregisterListener(listener);
      thread.quitSafely();
    }
    return Result.success();
  }
}

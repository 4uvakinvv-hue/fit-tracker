package ru.forma.app;

import android.content.Context;
import android.content.SharedPreferences;

import java.time.LocalDate;

public final class StepCounterStore {
  private static final String PREFS="forma_step_counter";
  private static final String KEY_DATE="date";
  private static final String KEY_LAST_COUNTER="last_counter";
  private static final String KEY_TODAY_STEPS="today_steps";

  public static final class Snapshot {
    public final String date;
    public final long counter;
    public final int todaySteps;
    Snapshot(String date,long counter,int todaySteps){
      this.date=date;this.counter=counter;this.todaySteps=todaySteps;
    }
  }

  private StepCounterStore(){}

  public static synchronized Snapshot update(Context context,long currentCounter,int seedSteps){
    SharedPreferences p=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
    String today=LocalDate.now().toString();
    String storedDate=p.getString(KEY_DATE,null);
    long lastCounter=p.getLong(KEY_LAST_COUNTER,-1L);
    int storedToday=Math.max(0,p.getInt(KEY_TODAY_STEPS,0));
    int next;

    if(today.equals(storedDate)){
      next=Math.max(storedToday,Math.max(0,seedSteps));
      if(lastCounter>=0 && currentCounter>=lastCounter){
        long delta=currentCounter-lastCounter;
        if(delta>0 && delta<Integer.MAX_VALUE){
          next=Math.max(next,(int)Math.min(Integer.MAX_VALUE,(long)next+delta));
        }
      }
    }else{
      long delta=(lastCounter>=0 && currentCounter>=lastCounter)?currentCounter-lastCounter:0;
      next=Math.max(Math.max(0,seedSteps),(int)Math.min(Integer.MAX_VALUE,Math.max(0,delta)));
    }

    p.edit()
      .putString(KEY_DATE,today)
      .putLong(KEY_LAST_COUNTER,currentCounter)
      .putInt(KEY_TODAY_STEPS,next)
      .apply();

    return new Snapshot(today,currentCounter,next);
  }

  public static synchronized Snapshot read(Context context){
    SharedPreferences p=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
    String today=LocalDate.now().toString();
    String storedDate=p.getString(KEY_DATE,today);
    long lastCounter=p.getLong(KEY_LAST_COUNTER,-1L);
    int storedToday=Math.max(0,p.getInt(KEY_TODAY_STEPS,0));
    if(!today.equals(storedDate))storedToday=0;
    return new Snapshot(today,lastCounter,storedToday);
  }
}

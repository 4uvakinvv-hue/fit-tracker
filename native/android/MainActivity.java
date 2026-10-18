package ru.forma.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(StepCounterPlugin.class);
    registerPlugin(FlaneuringPlugin.class);
    super.onCreate(savedInstanceState);
  }
}

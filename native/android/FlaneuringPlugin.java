package ru.forma.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

@CapacitorPlugin(
  name="Flaneuring",
  permissions={
    @Permission(alias="location",strings={Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION})
  }
)
public class FlaneuringPlugin extends Plugin {
  private PluginCall pendingStart;

  private boolean locationGranted(){
    return ContextCompat.checkSelfPermission(getContext(),Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED
      || ContextCompat.checkSelfPermission(getContext(),Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;
  }

  private JSObject js(JSONObject obj){
    try{return JSObject.fromJSONObject(obj);}catch(Exception e){return new JSObject();}
  }

  @PluginMethod public void start(PluginCall call){
    if(!locationGranted()){
      pendingStart=call;
      requestPermissionForAlias("location",call,"locationCallback");
      return;
    }
    startNow(call);
  }

  @PermissionCallback private void locationCallback(PluginCall call){
    pendingStart=null;
    if(!locationGranted()){call.reject("Location permission required","permission_required");return;}
    startNow(call);
  }

  private void startNow(PluginCall call){
    JSONObject state=FlaneuringStore.start(getContext());
    Intent intent=new Intent(getContext(),FlaneuringService.class).setAction(FlaneuringService.ACTION_START);
    if(Build.VERSION.SDK_INT>=26)getContext().startForegroundService(intent);else getContext().startService(intent);
    call.resolve(js(state));
  }

  @PluginMethod public void stop(PluginCall call){
    Intent intent=new Intent(getContext(),FlaneuringService.class).setAction(FlaneuringService.ACTION_STOP);
    getContext().startService(intent);
    JSONObject result=FlaneuringStore.finish(getContext(),false);
    call.resolve(js(result));
  }

  @PluginMethod public void status(PluginCall call){call.resolve(js(FlaneuringStore.status(getContext())));}
  @PluginMethod public void getCompleted(PluginCall call){call.resolve(js(FlaneuringStore.completed(getContext())));}
  @PluginMethod public void clearCompleted(PluginCall call){FlaneuringStore.clearCompleted(getContext());call.resolve();}
}

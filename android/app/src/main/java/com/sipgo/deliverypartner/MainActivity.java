package com.sipgo.deliverypartner;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.Plugin;

@CapacitorPlugin(name = "OnlineOverlay")
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        bridge.registerPlugin(OnlineOverlayPlugin.class);
    }

    public static class OnlineOverlayPlugin extends Plugin {

        @com.getcapacitor.PluginMethod
        public void start(PluginCall call) {
            if (!Settings.canDrawOverlays(getContext())) {
                Intent intent = new Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName())
                );
                getContext().startActivity(intent);
                call.reject("OVERLAY_PERMISSION_REQUIRED");
                return;
            }

            Intent serviceIntent = new Intent(
                getContext(),
                OnlineOverlayService.class
            );

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(serviceIntent);
            } else {
                getContext().startService(serviceIntent);
            }

            JSObject result = new JSObject();
            result.put("started", true);
            call.resolve(result);
        }

        @com.getcapacitor.PluginMethod
        public void stop(PluginCall call) {
            Intent serviceIntent = new Intent(
                getContext(),
                OnlineOverlayService.class
            );

            getContext().stopService(serviceIntent);

            JSObject result = new JSObject();
            result.put("stopped", true);
            call.resolve(result);
        }
    }
}

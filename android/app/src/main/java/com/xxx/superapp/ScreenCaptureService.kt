package com.xxx.superapp

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class ScreenCaptureService:Service(){
 companion object{
  const val EXTRA_RESULT_CODE="result_code"
  const val EXTRA_DATA="result_data"
  const val ACTION_STOP="com.xxx.superapp.STOP_SCREEN"
 }
 private var projection:MediaProjection?=null
 override fun onStartCommand(i:Intent?,flags:Int,startId:Int):Int{
  if(i?.action==ACTION_STOP){stopSelf();return START_NOT_STICKY}
  val code=i?.getIntExtra(EXTRA_RESULT_CODE,-1)?:-1
  val data=i?.getParcelableExtra<Intent>(EXTRA_DATA)?:return START_NOT_STICKY
  val pm=getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
  projection=pm.getMediaProjection(code,data)
  if(projection==null){stopSelf();return START_NOT_STICKY}
  val n=NotificationCompat.Builder(this,"dro_control").setSmallIcon(android.R.drawable.ic_menu_view).setContentTitle("DRO Phone Control Active").setContentText("Screen sharing is active").setOngoing(true).addAction(android.R.drawable.ic_menu_close_clear_cancel,"STOP",PendingIntent.getService(this,77,Intent(this,ACTION_STOP),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)).build()
  if(Build.VERSION.SDK_INT>=29)startForeground(2002,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION) else startForeground(2002,n)
  return START_STICKY
 }
 override fun onDestroy(){projection?.stop();projection=null;super.onDestroy()}
 override fun onBind(i:Intent?):IBinder?=null
}
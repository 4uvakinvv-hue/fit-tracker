package ru.chuvakin.kurswidget;

import android.app.Activity;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.net.Uri;
import android.os.Bundle;
import android.graphics.Color;
import android.graphics.Paint;
import android.text.SpannableString;
import android.text.style.StrikethroughSpan;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.UUID;

public final class MainActivity extends Activity {
    static final String PREF = "kurs_widget_v1";
    static final String KEY = "tasks";
    static final String TOGGLE = "ru.chuvakin.kurswidget.TOGGLE";
    static final int[] ROWS = {R.id.t0,R.id.t1,R.id.t2,R.id.t3,R.id.t4,R.id.t5,R.id.t6,R.id.t7,R.id.t8,R.id.t9};
    LinearLayout root;
    boolean showHistory = false;

    static synchronized JSONArray load(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        String raw = p.getString(KEY, null);
        JSONArray a;
        if (raw == null) {
            a = new JSONArray();
            LocalDate now = LocalDate.now();
            if (!now.isAfter(LocalDate.of(2026,11,11))) {
                String[] initial = {
                    "07:30–08:30 — FORMA: выпустить редизайн без иконок",
                    "Комплектатор: отдельный чат и описание структуры",
                    "МПК: самопрезентации для застройщика и дизайнера",
                    "Армен МКС2: написать и договориться о кофе",
                    "Дизайнер от Армена: позвонить и обсудить МПК",
                    "Соманаев: узнать конкретный срок выплаты",
                    "Ксюша: подобрать мототренировку на Мацесте"
                };
                for (String s:initial) put(a,s, now.toString());
            }
            save(c,a);
        } else {
            try { a = new JSONArray(raw); }
            catch(Exception ex) { return new JSONArray(); }
        }
        boolean changed = false;
        String today=LocalDate.now().toString();
        for(int i=0;i<a.length();i++) {
            JSONObject o = a.optJSONObject(i);
            if(o==null)continue;
            if(!o.optBoolean("done",false) && o.optString("day","").compareTo(today)<0) {
                try { o.put("day",today); changed=true; } catch(Exception ignored){}
            }
        }
        if(changed)save(c,a);
        return a;
    }
    static void put(JSONArray a,String text,String day) {
        try { JSONObject o=new JSONObject();o.put("id",UUID.randomUUID().toString());
            o.put("text",text);o.put("day",day);o.put("done",false);a.put(o); }
        catch(Exception ignored){}
    }
    static void save(Context c,JSONArray a) {
        c.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().putString(KEY,a.toString()).commit();
    }
    static synchronized void toggle(Context c,String id) {
        JSONArray a=load(c);
        for(int i=0;i<a.length();i++) {
            JSONObject o=a.optJSONObject(i);
            if(o==null || !id.equals(o.optString("id")))continue;
            try {
                boolean next=!o.optBoolean("done",false);
                o.put("done",next);
                o.put("completed",next?LocalDate.now().toString():JSONObject.NULL);
            }catch(Exception ignored){}
            break;
        }
        save(c,a);Widget.refresh(c);
    }
    static synchronized void remove(Context c,String id) {
        JSONArray a=load(c);
        for(int i=0;i<a.length();i++) {
            JSONObject o=a.optJSONObject(i);
            if(o!=null && id.equals(o.optString("id"))) {a.remove(i);break;}
        }
        save(c,a);Widget.refresh(c);
    }
    static JSONArray today(Context c) {
        JSONArray source=load(c), result=new JSONArray();
        String date=LocalDate.now().toString();
        for(int i=0;i<source.length();i++){
            JSONObject o=source.optJSONObject(i);
            if(o!=null && date.equals(o.optString("day")))result.put(o);
        }
        return result;
    }
    static String plan(Context c) {
        JSONArray a=today(c);
        StringBuilder b=new StringBuilder("Помоги составить план на завтра. План на сегодня:\n\n");
        for(int i=0;i<a.length();i++) {
            JSONObject o=a.optJSONObject(i);
            if(o!=null)b.append(o.optBoolean("done")?"☑ ":"☐ ").append(o.optString("text")).append("\n");
        }
        b.append("\nПеренеси незакрытое, предложи максимум 4–7 реалистичных задач. Главный приоритет — советник собственника. Обязательна хотя бы одна личная задача, желательно для Ксюши. Сначала предложи на утверждение.");
        return b.toString();
    }
    public static final class Widget extends AppWidgetProvider {
        @Override public void onUpdate(Context c,AppWidgetManager m,int[] ids) {
            for(int id:ids)render(c,m,id);
        }
        @Override public void onReceive(Context c,Intent intent) {
            if(TOGGLE.equals(intent.getAction())) {
                String id=intent.getStringExtra("id");
                if(id!=null)toggle(c,id);
                return;
            }
            super.onReceive(c,intent);
            if(Intent.ACTION_DATE_CHANGED.equals(intent.getAction()))refresh(c);
        }
        static void refresh(Context c) {
            AppWidgetManager m=AppWidgetManager.getInstance(c);
            ComponentName n=new ComponentName(c,Widget.class);
            for(int wid:m.getAppWidgetIds(n))render(c,m,wid);
        }
        static void render(Context c,AppWidgetManager m,int wid) {
            RemoteViews v=new RemoteViews(c.getPackageName(),R.layout.widget);
            JSONArray a=today(c);
            int done=0;
            for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o!=null && o.optBoolean("done"))done++;}
            String date=LocalDate.now().format(DateTimeFormatter.ofPattern("d MMMM, EEEE",new Locale("ru")));
            v.setTextViewText(R.id.date,date);
            v.setTextViewText(R.id.progress,"Выполнено: "+done+" из "+a.length());
            for(int i=0;i<ROWS.length;i++) {
                int row=ROWS[i];
                if(i>=a.length()){v.setViewVisibility(row,View.GONE);continue;}
                JSONObject o=a.optJSONObject(i);
                if(o==null){v.setViewVisibility(row,View.GONE);continue;}
                v.setViewVisibility(row,View.VISIBLE);
                boolean finished=o.optBoolean("done");
                String label=(finished?"☑   ":"☐   ")+o.optString("text","");
                if(finished){SpannableString s=new SpannableString(label);s.setSpan(new StrikethroughSpan(),4,s.length(),0);v.setTextViewText(row,s);}
                else v.setTextViewText(row,label);
                v.setTextColor(row,finished?0xFF8B9891:0xFF23392E);
                Intent click=new Intent(c,Widget.class);
                click.setAction(TOGGLE);
                click.putExtra("id",o.optString("id"));
                PendingIntent pi=PendingIntent.getBroadcast(c,100+i,click,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
                v.setOnClickPendingIntent(row,pi);
            }
            Intent open=new Intent(c,MainActivity.class);
            v.setOnClickPendingIntent(R.id.title,PendingIntent.getActivity(c,200,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
            Intent chat=new Intent(c,MainActivity.class);
            chat.putExtra("chat",true);
            v.setOnClickPendingIntent(R.id.chat,PendingIntent.getActivity(c,201,chat,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
            m.updateAppWidget(wid,v);
        }
    }
    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        if(getIntent().getBooleanExtra("chat",false)) {openChat();finish();return;}
        build();
    }
    void openChat() {
        ClipboardManager cb=(ClipboardManager)getSystemService(CLIPBOARD_SERVICE);
        cb.setPrimaryClip(ClipData.newPlainText("КУРС — план",plan(this)));
        Toast.makeText(this,"План скопирован. Вставь его в ChatGPT.",Toast.LENGTH_LONG).show();
        try {
            Intent app=getPackageManager().getLaunchIntentForPackage("com.openai.chatgpt");
            startActivity(app!=null?app:new Intent(Intent.ACTION_VIEW,Uri.parse("https://chatgpt.com/")));
        }catch(Exception ex){Toast.makeText(this,"Открой ChatGPT вручную",Toast.LENGTH_LONG).show();}
    }
    static TextView text(Context c,String value,int size) {
        TextView t=new TextView(c); t.setText(value);t.setTextSize(size);
        t.setTextColor(0xFF23392E);t.setPadding(0,10,0,10);return t;
    }
    void build() {
        ScrollView sc=new ScrollView(this);
        root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(24,20,24,24);root.setBackgroundColor(0xFFF6F8F4);sc.addView(root);
        TextView head=text(this,"КУРС · План на сегодня",24);root.addView(head);
        JSONArray a=today(this);
        int cnt=0;for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o!=null && o.optBoolean("done"))cnt++;}
        root.addView(text(this,"Выполнено: "+cnt+" из "+a.length(),15));
        for(int i=0;i<a.length();i++) {
            JSONObject o=a.optJSONObject(i);if(o==null)continue;
            String id=o.optString("id");
            LinearLayout row=new LinearLayout(this);row.setOrientation(LinearLayout.HORIZONTAL);
            CheckBox cb=new CheckBox(this);cb.setText(o.optString("text"));cb.setTextColor(0xFF23392E);cb.setTextSize(15);
            cb.setChecked(o.optBoolean("done"));
            cb.setLayoutParams(new LinearLayout.LayoutParams(0,-2,1));
            if(o.optBoolean("done"))cb.setPaintFlags(cb.getPaintFlags()|Paint.STRIKE_THRU_TEXT_FLAG);
            cb.setOnClickListener(v->{toggle(this,id);build();});
            Button del=new Button(this);del.setText("×");
            del.setOnClickListener(v->{remove(this,id);build();});
            row.addView(cb);row.addView(del);root.addView(row);
        }
        EditText input=new EditText(this); input.setHint("Новая задача");input.setSingleLine(false);root.addView(input);
        LinearLayout addRow=new LinearLayout(this);
        Button todayButton=new Button(this);todayButton.setText("+ Сегодня");
        Button tomorrowButton=new Button(this);tomorrowButton.setText("+ Завтра");
        todayButton.setOnClickListener(v->{add(input.getText().toString(),LocalDate.now());});
        tomorrowButton.setOnClickListener(v->{add(input.getText().toString(),LocalDate.now().plusDays(1));});
        addRow.addView(todayButton);addRow.addView(tomorrowButton);root.addView(addRow);
        Button chat=new Button(this);chat.setText("План с ChatGPT");chat.setOnClickListener(v->openChat());root.addView(chat);
        Button history=new Button(this);history.setText(showHistory?"Скрыть историю":"История выполненного");
        history.setOnClickListener(v->{showHistory=!showHistory;build();});root.addView(history);
        if(showHistory){
            JSONArray all=load(this);String d=LocalDate.now().toString();int count=0;
            for(int i=0;i<all.length();i++){
                JSONObject o=all.optJSONObject(i);
                if(o!=null && o.optBoolean("done")&&!d.equals(o.optString("day"))) {
                    root.addView(text(this,"✓ "+o.optString("completed")+" — "+o.optString("text"),14));count++;
                }
            }
            if(count==0)root.addView(text(this,"История пока пуста",14));
        }
        setContentView(sc);
    }
    void add(String val,LocalDate date){
        if(val.trim().isEmpty())return;
        JSONArray a=load(this);put(a,val.trim(),date.toString());save(this,a);Widget.refresh(this);build();
    }
}

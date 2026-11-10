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
import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.widget.EditText;
import java.time.DayOfWeek;
import java.time.temporal.TemporalAdjusters;
import java.util.Calendar;
import java.util.HashSet;
import java.util.Set;


public final class MainActivity extends Activity {
    static final String PREF = "kurs_widget_v1";
    static final String KEY = "tasks";
    static final String TOGGLE = "ru.chuvakin.kurswidget.TOGGLE";
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
                    "07:30–08:30 · FORMA: выпуск готового редизайна",
                    "Комплектатор: описать MVP и рабочие процессы",
                    "VS Code: установить, настроить и открыть Комплектатор",
                    "Вася Мебель: самопрезентация застройщику",
                    "Вася Мебель: самопрезентация дизайнеру",
                    "Армен МКС2: договориться о кофе по меблировке",
                    "Дизайнер от Армена: связаться по проектам",
                    "Саманаев: уточнить сроки выплаты",
                    "Никитин: обсудить роли, продажи, ответственность",
                    "Евгений: диагностическая встреча",
                    "Сергей МКС2: два часа на модель партнёрства",
                    "Ксюша: найти и организовать мототренировку на Мацесте"
                };
                for (String title:initial) {
                    put(a,title,now.toString());
                    JSONObject added=a.optJSONObject(a.length()-1);
                    if(added!=null)try {
                        if(title.startsWith("Никитин:")) added.put("due","2026-11-11");
                        if(title.startsWith("Евгений:")) added.put("due","2026-11-13");
                    }catch(Exception ignored){}
                }
            }
            save(c,a);
        } else {
            try { a = new JSONArray(raw); }
            catch(Exception ex) { return new JSONArray(); }
        }
        boolean changed = false;
        JSONArray migrated = migrateLegacyAndCompact(a);
        if(migrated != a) {a=migrated;changed=true;}
        String monday=weekStart().toString();
        for(int i=0;i<a.length();i++) {
            JSONObject o = a.optJSONObject(i);
            if(o==null)continue;
            if(!o.optBoolean("done",false) && o.optString("day","").compareTo(monday)<0) {
                try { o.put("day",monday); changed=true; } catch(Exception ignored){}
            }
        }
        if(changed)save(c,a);
        return a;
    }
    // Preserve completion state and IDs while splitting the previously combined MПК item.
    // Shorter labels give larger text room on a single Galaxy home screen.
    static JSONArray migrateLegacyAndCompact(JSONArray source) {
        JSONArray result=new JSONArray();
        boolean changed=false;
        for(int i=0;i<source.length();i++){
            JSONObject o=source.optJSONObject(i);
            if(o==null)continue;
            String label=o.optString("text","");
            try {
                if(label.equals("МПК: самопрезентации для застройщика и дизайнера")
                    || label.equals("МПК: две самопрезентации — для застройщика и дизайнера")) {
                    o.put("text","Вася Мебель: для застройщика");
                    result.put(o);
                    JSONObject second=new JSONObject(o.toString());
                    second.put("id",UUID.randomUUID().toString());
                    second.put("text","Вася Мебель: для дизайнера");
                    result.put(second);
                    changed=true;
                    continue;
                }
                String compact=label;
                if(label.equals("07:30–08:30 — FORMA: выпустить редизайн без иконок"))
                    compact="07:30–08:30 · FORMA: релиз без иконок";
                else if(label.equals("Комплектатор: отдельный чат и описание структуры"))
                    compact="Комплектатор: описать структуру";
                else if(label.equals("МПК: презентация застройщику") || label.equals("МПК: самопрезентация для застройщика") || label.equals("Вася Мебель: для застройщика"))
                    compact="Вася Мебель: для застройщика";
                else if(label.equals("МПК: презентация дизайнеру") || label.equals("МПК: самопрезентация для дизайнера") || label.equals("Вася Мебель: для дизайнера"))
                    compact="Вася Мебель: для дизайнера";
                else if(label.equals("Армен МКС2: написать и договориться о кофе"))
                    compact="Армен МКС2: договориться о кофе";
                else if(label.equals("Дизайнер от Армена: позвонить и обсудить МПК") || label.equals("Дизайнер от Армена: позвонить"))
                    compact="Дизайнер от Армена: позвонить";
                else if(label.equals("Соманаев: узнать конкретный срок выплаты") || label.equals("Соманаев: узнать срок выплаты") || label.equals("Саманаев: узнать конкретный срок выплаты"))
                    compact="Саманаев: узнать срок выплаты";
                else if(label.equals("Ксюша: подобрать мототренировку на Мацесте"))
                    compact="Ксюша: мототренировка на Мацесте";
                if(!compact.equals(label)){o.put("text",compact);changed=true;}
            }catch(Exception ignored){}
            result.put(o);
        }
        return changed?result:source;
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
    static LocalDate weekStart() {
        return LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }
    static JSONArray week(Context c) {
        JSONArray all=load(c), result=new JSONArray();
        String monday=weekStart().toString();
        String sunday=weekStart().plusDays(6).toString();
        for(int i=0;i<all.length();i++) {
            JSONObject o=all.optJSONObject(i);
            if(o==null)continue;
            String day=o.optString("day","");
            if(day.compareTo(monday)>=0 && day.compareTo(sunday)<=0)result.put(o);
        }
        return result;
    }
    static String weekLabel() {
        LocalDate mon=weekStart(),sun=mon.plusDays(6);
        DateTimeFormatter f=DateTimeFormatter.ofPattern("d MMMM",new Locale("ru"));
        return "Неделя "+mon.getDayOfMonth()+"–"+sun.format(f);
    }
    static String plan(Context c) {
        JSONArray a=week(c);
        StringBuilder b=new StringBuilder("Помоги составить недельный план. Текущая неделя:\n\n");
        for(int i=0;i<a.length();i++) {
            JSONObject o=a.optJSONObject(i);
            if(o!=null)b.append(o.optBoolean("done")?"☑ ":"☐ ").append(o.optString("text")).append("\n");
        }
        b.append("\nСоставь план на следующую неделю, сохрани незавершённые задачи, соблюдай приоритет консалтинга и минимум одну личную задачу для Ксюши. Ответь строго строками вида ☐ Название задачи — чтобы я скопировал их в приложение. Не выдумывай выполненные дела и встречи.");
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
            JSONArray a=week(c);
            int done=0;
            for(int i=0;i<a.length();i++) {
                JSONObject o=a.optJSONObject(i);
                if(o!=null && o.optBoolean("done"))done++;
            }
            v.setTextViewText(R.id.date,weekLabel());
            v.setTextViewText(R.id.progress,"Выполнено: "+done+" из "+a.length());
            Intent svc=new Intent(c,WidgetListService.class);
            svc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,wid);
            svc.setData(Uri.parse("kurs-week://list/"+wid));
            v.setRemoteAdapter(R.id.taskList,svc);
            v.setEmptyView(R.id.taskList,R.id.empty);

            Intent toggleIntent=new Intent(c,Widget.class);
            toggleIntent.setAction(TOGGLE);
            PendingIntent template=PendingIntent.getBroadcast(c,wid,toggleIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
            v.setPendingIntentTemplate(R.id.taskList,template);

            Intent open=new Intent(c,MainActivity.class);
            PendingIntent edit=PendingIntent.getActivity(c,200,open,
                PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
            v.setOnClickPendingIntent(R.id.title,edit);
            v.setOnClickPendingIntent(R.id.editBtn,edit);
            Intent chat=new Intent(c,MainActivity.class);
            chat.putExtra("chat",true);
            v.setOnClickPendingIntent(R.id.chat,PendingIntent.getActivity(c,201,chat,
                PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
            m.updateAppWidget(wid,v);
            m.notifyAppWidgetViewDataChanged(wid,R.id.taskList);
        }
        @Override public void onAppWidgetOptionsChanged(Context c,AppWidgetManager m,int wid,Bundle opts) {
            render(c,m,wid);
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
        t.setTextColor(0xFF23392E);t.setPadding(0,6,0,6);return t;
    }
    void build() {
        ScrollView sc=new ScrollView(this);
        root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(20,16,20,24);
        root.setBackgroundColor(0xFFF6F8F4);
        sc.addView(root);

        root.addView(text(this,"КУРС · План на неделю",22));
        root.addView(text(this,weekLabel(),16));

        JSONArray a=week(this);
        int cnt=0;
        for(int i=0;i<a.length();i++) {
            JSONObject o=a.optJSONObject(i);
            if(o!=null && o.optBoolean("done"))cnt++;
        }
        root.addView(text(this,"Выполнено: "+cnt+" из "+a.length(),16));
        root.addView(text(this,"Галочка — выполнено. ✎ — изменить. ➜ — продолжение задачи.",13));

        for(int i=0;i<a.length();i++) {
            JSONObject o=a.optJSONObject(i);
            if(o==null)continue;
            String id=o.optString("id");
            LinearLayout row=new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(android.view.Gravity.CENTER_VERTICAL);

            CheckBox cb=new CheckBox(this);
            String label=o.optString("text","");
            String due=o.optString("due","");
            if(!due.isEmpty() && !due.equals("null")){
                try {
                    label=LocalDate.parse(due).format(DateTimeFormatter.ofPattern("EEE",new Locale("ru")))+" · "+label;
                }catch(Exception ignored){}
            }
            cb.setText(label);
            cb.setTextColor(0xFF23392E);
            cb.setTextSize(18);
            cb.setChecked(o.optBoolean("done"));
            cb.setLayoutParams(new LinearLayout.LayoutParams(0,-2,1));
            if(o.optBoolean("done"))cb.setPaintFlags(cb.getPaintFlags()|Paint.STRIKE_THRU_TEXT_FLAG);
            cb.setOnClickListener(v->{toggle(this,id);build();});

            Button edit=new Button(this);
            edit.setText("✎");
            edit.setTextSize(16);
            edit.setMinWidth(48);
            edit.setOnClickListener(v->taskDialog(id,false));
            Button next=new Button(this);
            next.setText("➜");
            next.setTextSize(16);
            next.setMinWidth(48);
            next.setOnClickListener(v->taskDialog(id,true));

            row.addView(cb);
            row.addView(edit);
            row.addView(next);
            root.addView(row);
        }

        Button newTask=new Button(this);
        newTask.setText("+ Новая задача");
        newTask.setOnClickListener(v->taskDialog(null,false));
        root.addView(newTask);

        Button importButton=new Button(this);
        importButton.setText("Вставить план из буфера");
        importButton.setOnClickListener(v->importPlanDialog());
        root.addView(importButton);

        Button chat=new Button(this);
        chat.setText("Составить план с ChatGPT");
        chat.setOnClickListener(v->openChat());
        root.addView(chat);

        Button history=new Button(this);
        history.setText(showHistory?"Скрыть историю":"История прошлых недель");
        history.setOnClickListener(v->{showHistory=!showHistory;build();});
        root.addView(history);
        if(showHistory){
            JSONArray all=load(this);
            String monday=weekStart().toString();
            int count=0;
            for(int i=0;i<all.length();i++){
                JSONObject o=all.optJSONObject(i);
                if(o!=null && o.optBoolean("done")&&o.optString("day","").compareTo(monday)<0) {
                    root.addView(text(this,"✓ "+o.optString("completed")+" — "+o.optString("text"),15));
                    count++;
                }
            }
            if(count==0)root.addView(text(this,"История пока пуста",15));
        }
        setContentView(sc);
    }

    void taskDialog(String id,boolean followup) {
        JSONArray all=load(this);
        JSONObject old=null;
        if(id!=null) {
            for(int i=0;i<all.length();i++) {
                JSONObject item=all.optJSONObject(i);
                if(item!=null&&id.equals(item.optString("id"))) {old=item;break;}
            }
        }
        final JSONObject found=old;
        boolean creating=(id==null||followup);
        String original=found==null?"":found.optString("text","");
        String initial=original;
        if(followup) {
            if(original.startsWith("Саманаев:"))
                initial="Саманаев: перезвонить по выплате";
            else
                initial=original+" — следующий шаг";
        }
        final LocalDate[] due=new LocalDate[]{null};
        if(!followup && found!=null){
            try {due[0]=LocalDate.parse(found.optString("due",""));}catch(Exception ignored){}
        }
        if(followup && original.startsWith("Саманаев:"))
            due[0]=LocalDate.now().with(TemporalAdjusters.nextOrSame(DayOfWeek.FRIDAY));

        LinearLayout panel=new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(24,14,24,10);
        EditText input=new EditText(this);
        input.setText(initial);
        input.setTextSize(18);
        input.setSingleLine(false);
        input.setMinLines(2);
        panel.addView(input);
        Button dueButton=new Button(this);
        dueButton.setText(due[0]==null?"Срок: без срока":"Срок: "+due[0]);
        dueButton.setOnClickListener(v->{
            LocalDate d=due[0]==null?LocalDate.now():due[0];
            DatePickerDialog picker=new DatePickerDialog(this,(view,y,m,day)->{
                due[0]=LocalDate.of(y,m+1,day);
                dueButton.setText("Срок: "+due[0]);
            },d.getYear(),d.getMonthValue()-1,d.getDayOfMonth());
            picker.show();
        });
        panel.addView(dueButton);
        Button clearDue=new Button(this);
        clearDue.setText("Убрать срок");
        clearDue.setOnClickListener(v->{due[0]=null;dueButton.setText("Срок: без срока");});
        panel.addView(clearDue);

        AlertDialog.Builder dialog=new AlertDialog.Builder(this)
            .setTitle(followup?"Следующий шаг":creating?"Новая задача":"Изменить задачу")
            .setView(panel)
            .setNegativeButton("Отмена",null)
            .setPositiveButton("Сохранить",(d,which)->{
                String title=input.getText().toString().trim();
                if(title.isEmpty())return;
                JSONArray items=load(this);
                if(creating) {
                    LocalDate planned=due[0]==null?weekStart():
                        due[0].with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
                    put(items,title,planned.toString());
                    JSONObject n=items.optJSONObject(items.length()-1);
                    if(n!=null&&due[0]!=null)try{n.put("due",due[0].toString());}catch(Exception ignored){}
                }else{
                    for(int i=0;i<items.length();i++){
                        JSONObject item=items.optJSONObject(i);
                        if(item==null||!id.equals(item.optString("id")))continue;
                        try{
                            item.put("text",title);
                            if(due[0]==null)item.remove("due");
                            else{
                                item.put("due",due[0].toString());
                                item.put("day",due[0].with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).toString());
                            }
                        }catch(Exception ignored){}
                        break;
                    }
                }
                save(this,items);
                Widget.refresh(this);
                build();
            });
        if(!creating)dialog.setNeutralButton("Удалить",(d,which)->{
            remove(this,id);
            build();
        });
        dialog.show();
    }

    void importPlanDialog() {
        ClipboardManager clipboard=(ClipboardManager)getSystemService(CLIPBOARD_SERVICE);
        String paste="";
        if(clipboard.hasPrimaryClip()&&clipboard.getPrimaryClip()!=null&&
            clipboard.getPrimaryClip().getItemCount()>0) {
            CharSequence text=clipboard.getPrimaryClip().getItemAt(0).coerceToText(this);
            if(text!=null)paste=text.toString();
        }
        LinearLayout panel=new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(20,12,20,12);
        EditText input=new EditText(this);
        input.setText(paste);
        input.setHint("☐ Задача 1\n☐ Задача 2\n☐ Задача для Ксюши");
        input.setMinLines(7);
        input.setTextSize(16);
        panel.addView(input);
        new AlertDialog.Builder(this)
            .setTitle("Добавить задачи на неделю")
            .setMessage("Вставь список строк с ☐. Выполненные задачи останутся на месте, дубликаты не добавятся.")
            .setView(panel)
            .setNegativeButton("Отмена",null)
            .setPositiveButton("Добавить",(d,which)->{
                JSONArray existing=load(this);
                JSONArray w=week(this);
                Set<String> names=new HashSet<>();
                for(int i=0;i<w.length();i++) {
                    JSONObject item=w.optJSONObject(i);
                    if(item!=null)names.add(item.optString("text","").trim().toLowerCase(new Locale("ru")));
                }
                int added=0;
                for(String line:input.getText().toString().split("\\n")) {
                    String task=line.trim();
                    if(task.startsWith("☐")||task.startsWith("☑"))
                        task=task.substring(1).trim();
                    else if(task.matches("^[-*] \\[.\\].*"))
                        task=task.substring(5).trim();
                    else continue;
                    if(task.isEmpty()||task.length()>240)continue;
                    String key=task.toLowerCase(new Locale("ru"));
                    if(names.contains(key))continue;
                    put(existing,task,weekStart().toString());
                    names.add(key);
                    added++;
                }
                save(this,existing);
                Widget.refresh(this);
                build();
                Toast.makeText(this,"Добавлено: "+added,Toast.LENGTH_SHORT).show();
            }).show();
    }
    void add(String val,LocalDate date){
        if(val.trim().isEmpty())return;
        JSONArray a=load(this);put(a,val.trim(),date.toString());save(this,a);Widget.refresh(this);build();
    }
}

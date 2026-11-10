package ru.chuvakin.kurswidget;

import android.content.Context;
import android.content.Intent;
import android.text.SpannableString;
import android.text.style.StrikethroughSpan;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

public final class WidgetListService extends RemoteViewsService {
    @Override public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new ListFactory(getApplicationContext());
    }

    static final class ListFactory implements RemoteViewsFactory {
        private final Context context;
        private JSONArray tasks = new JSONArray();
        ListFactory(Context context) { this.context=context; }
        @Override public void onCreate() { onDataSetChanged(); }
        @Override public void onDataSetChanged() { tasks = MainActivity.week(context); }
        @Override public void onDestroy() { tasks = new JSONArray(); }
        @Override public int getCount() { return tasks.length(); }
        @Override public int getViewTypeCount() { return 1; }
        @Override public boolean hasStableIds() { return true; }
        @Override public long getItemId(int position) {
            JSONObject o=tasks.optJSONObject(position);
            return o==null ? position : o.optString("id").hashCode();
        }
        @Override public RemoteViews getLoadingView() { return null; }
        @Override public RemoteViews getViewAt(int position) {
            JSONObject o=tasks.optJSONObject(position);
            if(o==null)return null;
            RemoteViews row=new RemoteViews(context.getPackageName(),R.layout.widget_task);
            boolean completed=o.optBoolean("done",false);
            String task=o.optString("text","");
            String due=o.optString("due","");
            if(!due.isEmpty() && !due.equals("null")) {
                try {
                    LocalDate d=LocalDate.parse(due);
                    String name=d.format(DateTimeFormatter.ofPattern("EEE",new Locale("ru")));
                    task=name+" · "+task;
                }catch(Exception ignored){}
            }
            String label=(completed?"☑  ":"☐  ")+task;
            if(completed) {
                SpannableString marked=new SpannableString(label);
                marked.setSpan(new StrikethroughSpan(),3,marked.length(),0);
                row.setTextViewText(R.id.taskText,marked);
            }else row.setTextViewText(R.id.taskText,label);
            row.setTextColor(R.id.taskText,completed?0xFF8B9891:0xFF23392E);
            Intent click=new Intent();
            click.putExtra("id",o.optString("id"));
            row.setOnClickFillInIntent(R.id.taskRow,click);
            return row;
        }
    }
}

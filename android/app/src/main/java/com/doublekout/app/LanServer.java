package com.doublekout.app;

import android.content.res.AssetManager;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public final class LanServer {
    public static final int PORT = 8765;
    private final AssetManager assets;
    private volatile boolean running = false;
    private ServerSocket server;
    private final Set<Peer> peers = Collections.newSetFromMap(new ConcurrentHashMap<Peer, Boolean>());
    private final Object roomLock = new Object();
    private int capacity = 4;
    private Peer hostPeer;

    public LanServer(AssetManager assets) { this.assets = assets; }

    public synchronized JSONObject start() throws Exception {
        if (running && server != null && !server.isClosed()) return serverInfo();
        server = new ServerSocket();
        server.setReuseAddress(true);
        server.bind(new InetSocketAddress(PORT), 20);
        running = true;
        Thread t = new Thread(this::acceptLoop, "DoubleKout-LAN");
        t.setDaemon(true); t.start();
        return serverInfo();
    }

    public synchronized void stop() {
        running = false;
        try { if (server != null) server.close(); } catch (Exception ignored) {}
        for (Peer p : peers) p.close();
        peers.clear();
        synchronized (roomLock) { hostPeer = null; }
    }

    private JSONObject serverInfo() throws Exception {
        String ip = localIpv4();
        return new JSONObject().put("ok", true).put("port", PORT).put("ip", ip).put("url", "http://" + ip + ":" + PORT + "/");
    }

    private String localIpv4() throws Exception {
        String fallback = "127.0.0.1";
        Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
        while (interfaces != null && interfaces.hasMoreElements()) {
            NetworkInterface ni = interfaces.nextElement();
            if (!ni.isUp() || ni.isLoopback()) continue;
            Enumeration<InetAddress> addresses = ni.getInetAddresses();
            while (addresses.hasMoreElements()) {
                InetAddress a = addresses.nextElement();
                if (a instanceof Inet4Address && !a.isLoopbackAddress() && !a.isLinkLocalAddress()) {
                    String ip = a.getHostAddress();
                    if (a.isSiteLocalAddress()) return ip;
                    fallback = ip;
                }
            }
        }
        return fallback;
    }

    private void acceptLoop() {
        while (running) {
            try {
                Socket socket = server.accept();
                socket.setTcpNoDelay(true);
                Thread t = new Thread(() -> handle(socket), "DoubleKout-LAN-peer");
                t.setDaemon(true); t.start();
            } catch (Exception e) { if (running) e.printStackTrace(); }
        }
    }

    private void handle(Socket socket) {
        try {
            InputStream in = new BufferedInputStream(socket.getInputStream());
            OutputStream out = new BufferedOutputStream(socket.getOutputStream());
            String header = readHeaders(in);
            if (header == null) { socket.close(); return; }
            String first = header.split("\r\n", 2)[0];
            Map<String,String> headers = parseHeaders(header);
            if ("websocket".equalsIgnoreCase(headers.get("upgrade"))) {
                String key = headers.get("sec-websocket-key");
                if (key == null) { socket.close(); return; }
                String accept = Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-1").digest(
                    (key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").getBytes(StandardCharsets.UTF_8)));
                String response = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n";
                out.write(response.getBytes(StandardCharsets.US_ASCII)); out.flush();
                Peer peer = new Peer(socket, in, out);
                peers.add(peer); peer.readLoop(); return;
            }
            serveHttp(first, out); socket.close();
        } catch (Exception ignored) { try { socket.close(); } catch (Exception ignored2) {} }
    }

    private String readHeaders(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int state = 0, ch;
        while ((ch = in.read()) != -1) {
            b.write(ch); if (b.size() > 16384) throw new IOException("HTTP headers too large");
            if (state == 0 && ch == '\r') state = 1;
            else if (state == 1 && ch == '\n') state = 2;
            else if (state == 2 && ch == '\r') state = 3;
            else if (state == 3 && ch == '\n') break;
            else state = ch == '\r' ? 1 : 0;
        }
        return b.size() == 0 ? null : b.toString("UTF-8");
    }

    private Map<String,String> parseHeaders(String raw) {
        Map<String,String> map = new HashMap<>();
        String[] lines = raw.split("\r\n");
        for (int i=1;i<lines.length;i++) {
            int p=lines[i].indexOf(':');
            if (p>0) map.put(lines[i].substring(0,p).trim().toLowerCase(Locale.US), lines[i].substring(p+1).trim());
        }
        return map;
    }

    private void serveHttp(String request, OutputStream out) throws IOException {
        String[] bits=request.split(" ");
        String path=bits.length>1?bits[1].split("\\?",2)[0]:"/";
        if("/".equals(path))path="/index.html";
        path=path.replace('\\','/');
        if(path.contains("..")){writeHttp(out,403,"text/plain","Forbidden".getBytes(StandardCharsets.UTF_8));return;}
        String asset=path.startsWith("/")?path.substring(1):path;
        try(InputStream stream=assets.open(asset);ByteArrayOutputStream body=new ByteArrayOutputStream()){
            byte[] buf=new byte[8192];int n;while((n=stream.read(buf))!=-1)body.write(buf,0,n);
            writeHttp(out,200,mime(asset),body.toByteArray());
        }catch(Exception e){writeHttp(out,404,"text/plain; charset=utf-8","فایل پیدا نشد".getBytes(StandardCharsets.UTF_8));}
    }

    private String mime(String path){
        String p=path.toLowerCase(Locale.US);
        if(p.endsWith(".html"))return "text/html; charset=utf-8";
        if(p.endsWith(".js"))return "application/javascript; charset=utf-8";
        if(p.endsWith(".css"))return "text/css; charset=utf-8";
        if(p.endsWith(".json")||p.endsWith(".webmanifest"))return "application/json; charset=utf-8";
        if(p.endsWith(".png"))return "image/png";
        if(p.endsWith(".jpg")||p.endsWith(".jpeg"))return "image/jpeg";
        if(p.endsWith(".svg"))return "image/svg+xml";
        if(p.endsWith(".mp3"))return "audio/mpeg";
        return "application/octet-stream";
    }

    private void writeHttp(OutputStream out,int status,String type,byte[] body)throws IOException{
        String label=status==200?"OK":status==403?"Forbidden":"Not Found";
        String head="HTTP/1.1 "+status+" "+label+"\r\nContent-Type: "+type+"\r\nContent-Length: "+body.length+"\r\nConnection: close\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\n\r\n";
        out.write(head.getBytes(StandardCharsets.US_ASCII));out.write(body);out.flush();
    }

    private void onMessage(Peer peer,String raw){
        try{
            JSONObject msg=new JSONObject(raw);String type=msg.optString("type","");
            if("join".equals(type)){
                synchronized(roomLock){
                    if(msg.optBoolean("host",false)){
                        if(hostPeer!=null&&hostPeer!=peer){peer.send(new JSONObject().put("type","error").put("message","در این میز میزبان دیگری فعال است."));return;}
                        hostPeer=peer;capacity=msg.optInt("capacity",4)==6?6:4;
                    }else if(hostPeer==null){peer.send(new JSONObject().put("type","error").put("message","هنوز میزبان میز را ایجاد نکرده است."));return;}
                    peer.id=UUID.randomUUID().toString();peer.name=cleanName(msg.optString("name","بازیکن"));peer.host=peer==hostPeer;
                    int wanted=msg.optInt("seat",-1);peer.seat=seatAvailable(wanted,peer)?wanted:firstFreeSeat();
                    if(peer.seat<0){peer.send(new JSONObject().put("type","error").put("message","تمام صندلی‌ها پر هستند."));return;}
                    peer.joined=true;
                    peer.send(new JSONObject().put("type","welcome").put("id",peer.id).put("seat",peer.seat).put("host",peer.host).put("capacity",capacity));
                }
                broadcastRoom();
            }else if("seat".equals(type)&&peer.joined){
                synchronized(roomLock){int wanted=msg.optInt("seat",-1);if(seatAvailable(wanted,peer))peer.seat=wanted;}
                broadcastRoom();
            }else if("ready".equals(type)&&peer.joined){peer.ready=msg.optBoolean("ready",!peer.ready);broadcastRoom();}
            else if("ping".equals(type))peer.send(new JSONObject().put("type","pong"));
            else if("leave".equals(type))peer.close();
        }catch(Exception ignored){}
    }

    private String cleanName(String s){
        String v=s==null?"بازیکن":s.replaceAll("[\\r\\n<>]","").trim();
        if(v.isEmpty())v="بازیکن";return v.length()>18?v.substring(0,18):v;
    }

    private boolean seatAvailable(int seat,Peer owner){
        if(seat<0||seat>=capacity)return false;
        for(Peer p:peers)if(p!=owner&&p.joined&&p.seat==seat)return false;
        return true;
    }

    private int firstFreeSeat(){for(int i=0;i<capacity;i++)if(seatAvailable(i,null))return i;return -1;}

    private void broadcastRoom(){
        try{
            JSONObject room=new JSONObject().put("type","room").put("capacity",capacity);JSONArray players=new JSONArray();
            for(int i=0;i<capacity;i++){
                JSONObject seat=new JSONObject().put("seat",i);
                for(Peer p:peers)if(p.joined&&p.seat==i){seat.put("occupied",true).put("name",p.name).put("ready",p.ready).put("host",p.host);break;}
                if(!seat.has("occupied"))seat.put("occupied",false);players.put(seat);
            }
            room.put("players",players);for(Peer p:peers)if(p.joined)p.send(room);
        }catch(Exception ignored){}
    }

    private final class Peer{
        final Socket socket;final InputStream in;final OutputStream out;
        String id="",name="بازیکن";int seat=-1;boolean host=false,ready=false,joined=false;
        Peer(Socket s,InputStream i,OutputStream o){socket=s;in=i;out=o;}
        void readLoop(){
            try{
                while(running&&!socket.isClosed()){
                    int b1=in.read(),b2=in.read();if(b1<0||b2<0)break;
                    int opcode=b1&15;boolean masked=(b2&128)!=0;long len=b2&127;
                    if(len==126)len=((in.read()&255)<<8)|(in.read()&255);
                    else if(len==127){len=0;for(int i=0;i<8;i++)len=(len<<8)|(in.read()&255);}
                    if(len<0||len>1048576)break;
                    byte[] mask=masked?readN(in,4):null;byte[] data=readN(in,(int)len);
                    if(masked)for(int i=0;i<data.length;i++)data[i]^=mask[i%4];
                    if(opcode==8)break;if(opcode==9){sendFrame(10,data);continue;}
                    if(opcode==1)onMessage(this,new String(data,StandardCharsets.UTF_8));
                }
            }catch(Exception ignored){}finally{close();}
        }
        synchronized void send(JSONObject json){try{sendFrame(1,json.toString().getBytes(StandardCharsets.UTF_8));}catch(Exception ignored){}}
        synchronized void sendFrame(int opcode,byte[] data)throws IOException{
            if(socket.isClosed())return;out.write(0x80|opcode);
            if(data.length<126)out.write(data.length);
            else if(data.length<65536){out.write(126);out.write((data.length>>8)&255);out.write(data.length&255);}
            else{out.write(127);for(int i=7;i>=0;i--)out.write((data.length>>(8*i))&255);}
            out.write(data);out.flush();
        }
        void close(){
            try{socket.close();}catch(Exception ignored){}
            peers.remove(this);
            if(joined){synchronized(roomLock){if(hostPeer==this)hostPeer=null;}broadcastRoom();}
        }
    }

    private byte[] readN(InputStream in,int n)throws IOException{
        byte[] b=new byte[n];int off=0;while(off<n){int r=in.read(b,off,n-off);if(r<0)throw new EOFException();off+=r;}return b;
    }
}

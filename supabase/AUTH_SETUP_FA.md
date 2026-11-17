# راه‌اندازی ورود Apple ID و تأیید ایمیل در Double Kout

این راهنما برای پروژه Supabase زیر است:

- Project URL: https://awgzilkxmtyrcxpouxif.supabase.co
- وب‌سایت فعلی: https://ahdehwari-commits.github.io/Doublekout-/
- نشانی بازگشت OAuth و ایمیل تأیید (Redirect URL): https://ahdehwari-commits.github.io/Doublekout-/
- نشانی callback مخصوص Apple در Supabase: https://awgzilkxmtyrcxpouxif.supabase.co/auth/v1/callback

## ۱) تنظیم نشانی‌های مجاز Supabase

در Supabase Dashboard → Authentication → URL Configuration:

1. Site URL را روی نشانی GitHub Pages بالا بگذار.
2. همین نشانی را به Redirect URLs اضافه کن.
3. اگر بعداً دامنه اختصاصی گرفتی، نسخه HTTPS آن را هم به Site URL/Redirect URLs اضافه کن و مقدار PUBLIC_AUTH_REDIRECT در web-prototype.html را با آن هماهنگ کن.

## ۲) فعال‌سازی Apple ID

کد دکمه Apple ID و جریان OAuth در بازی وجود دارد؛ اما Apple Provider تا زمانی که اطلاعات Apple Developer در Supabase ثبت نشود، فعال نخواهد شد.

1. در Apple Developer یک App ID و یک Services ID بساز و Sign in with Apple را فعال کن.
2. در Services ID، دامنه و Return URL زیر را ثبت کن:
   - Domain: awgzilkxmtyrcxpouxif.supabase.co
   - Return URL: https://awgzilkxmtyrcxpouxif.supabase.co/auth/v1/callback
3. یک Sign in with Apple key بساز و Key ID، Team ID، Services ID و فایل خصوصی .p8 را نگه دار.
4. در Supabase Dashboard → Authentication → Sign In / Providers → Apple، Provider را روشن و مقادیر خواسته‌شده را وارد کن.
5. پس از ذخیره، ورود Apple را روی Safari آیفون و یک مرورگر دسکتاپ آزمایش کن.

نکته: برای این مرحله حساب فعال Apple Developer لازم است. کلید خصوصی .p8 را در GitHub یا داخل فایل‌های بازی قرار نده.

## ۳) تحویل ایمیل تأیید

کد ثبت‌نام، ارسال مجدد ایمیل تأیید و پردازش بازگشت به سایت را انجام می‌دهد؛ اما ارسال واقعی ایمیل به تنظیمات ایمیل پروژه Supabase وابسته است.

1. در Authentication → Providers → Email، تأیید ایمیل (Confirm email) را فعال نگه دار.
2. در Authentication → Email Templates → Confirm signup، قالب تأیید باید لینک تأیید استاندارد Supabase را نگه دارد (معمولاً {{ .ConfirmationURL }}).
3. برای تحویل قابل‌اتکا به کاربران عمومی، در Authentication → SMTP Settings یک SMTP اختصاصی تنظیم کن: فرستنده، میزبان، پورت، نام کاربری و رمز SMTP.
4. بعد از ذخیره، یک حساب آزمایشی با ایمیلی که به آن دسترسی داری بساز و صندوق ورودی و هرزنامه را بررسی کن.
5. اگر ایمیل نرسید، گزارش‌های Auth/SMTP در Supabase را بررسی کن؛ پیام «درخواست پذیرفته شد» از سمت کلاینت به معنی تحویل قطعی ایمیل نیست.

SMTP password و هر secret دیگری فقط باید در تنظیمات امن Supabase وارد شود، نه در مخزن GitHub.

## ۴) آزمون پس از تنظیم

- ثبت‌نام با ایمیل جدید → دریافت ایمیل → بازکردن لینک → بازگشت به همین سایت → مشاهده پیام تأیید.
- خروج و ورود مجدد با ایمیل و رمز.
- ارسال مجدد ایمیل تأیید برای حساب تأییدنشده.
- ورود با Apple ID و بازگشت به همان سایت.
- بررسی اینکه بازی پس از بازگشت از OAuth همچنان نشست کاربر را حفظ می‌کند.


## ۵) راه‌اندازی پرداخت یکپارچه زرین‌پال (وب، Android و iPhone)

پرداخت از طریق Edge Function مرکزی `zarinpal` انجام می‌شود؛ بنابراین هر سه نسخه از یک جریان پرداخت استفاده می‌کنند و نیازی به نگهداری کلید پذیرنده یا تأیید پرداخت در برنامه موبایل نیست.

### تنظیم امن در Supabase

در Supabase Dashboard → Edge Functions → Secrets این مقادیر را ثبت کن:

- `ZARINPAL_MERCHANT_ID`: کد پذیرنده زرین‌پال
- `ZARINPAL_SANDBOX`: برای آزمایش `true` و برای پرداخت واقعی `false`
- `APP_RETURN_URL`: `https://ahdehwari-commits.github.io/Doublekout-/`
- مقادیر استاندارد `SUPABASE_URL`، `SUPABASE_ANON_KEY` و `SUPABASE_SERVICE_ROLE_KEY` نیز باید در محیط Function موجود باشند؛ Service Role را هرگز در کلاینت یا GitHub قرار نده.

### انتشار Function

از ریشه مخزن، با Supabase CLI و دسترسی به پروژه اجرا کن:

```bash
supabase functions deploy zarinpal --project-ref awgzilkxmtyrcxpouxif
```

Function برای دریافت callback درگاه با `verify_jwt = false` تعریف شده است؛ درخواست ایجاد پرداخت در داخل Function توکن کاربر را جداگانه اعتبارسنجی می‌کند. callback نیز سفارش را از پایگاه داده می‌خواند و قبل از ثبت امتیاز، تراکنش را مستقیماً با زرین‌پال verify می‌کند.

### نکات انتشار و آزمون

1. جدول بسته‌ها و سفارش‌های پرداخت و تابع پایگاه داده `complete_zarinpal_payment` باید در پروژه Supabase اعمال شده باشند؛ بدون آن‌ها Function سفارش را ثبت یا نهایی نمی‌کند.
2. بسته‌های فعال از `point_topup_packages` خوانده می‌شوند؛ قیمت و تعداد امتیاز از سمت سرور تعیین می‌شود، نه از مرورگر یا اپ.
3. ابتدا با Sandbox یک خرید آزمایشی انجام بده و افزایش موجودی را در حساب مرکزی بررسی کن؛ سپس Merchant ID واقعی و `ZARINPAL_SANDBOX=false` را تنظیم کن.
4. بعد از تغییرات GitHub Pages، پرداخت را در Safari آیفون، مرورگر وب و اپ Android آزمایش کن. هر سه باید به همان درگاه و حساب مرکزی بروند.

### درباره SDK اندروید و JitPack

مخزن JitPack به تنظیمات Gradle اندروید اضافه شده است تا در صورت نیاز بتوان SDKهای JitPack را resolve کرد. در معماری مشترک فعلی، پرداخت با صفحه میزبانی‌شده زرین‌پال و Function سروری انجام می‌شود؛ بنابراین dependency اندروید زرین‌پال عمداً به اپ اضافه نشده، چون برای وب و iPhone قابل استفاده نیست و منطق پرداخت را نباید به یک پلتفرم محدود کرد.

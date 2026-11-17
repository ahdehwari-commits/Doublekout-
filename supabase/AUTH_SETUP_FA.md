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

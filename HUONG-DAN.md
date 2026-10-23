# Emma kể chuyện – Hướng dẫn đưa website lên mạng

Thời gian làm lần đầu: khoảng 30–45 phút. Toàn bộ miễn phí (trừ tên miền nếu mua).

## Cấu trúc thư mục

| Thư mục / file | Dùng để làm gì |
|---|---|
| `content/stories/` | Mỗi truyện là 1 file (trang Admin tự tạo/sửa) |
| `content/genres.json` | Danh sách thể loại |
| `content/settings.json` | Cài đặt website, quảng cáo, cổng mở khóa |
| `content/pages/` | Trang Giới thiệu, Chính sách bảo mật, Liên hệ |
| `admin/` | Trang quản trị tại `tenmien/admin` |
| `assets/` | Giao diện (CSS) và tương tác (JS) |
| `build.js` | Bộ sinh trang HTML chuẩn SEO, sitemap, RSS |

---

## Bước 1 – Đưa mã nguồn lên GitHub

1. Tạo tài khoản tại **github.com** (nếu chưa có).
2. Bấm **New repository** → đặt tên `emma-ke-chuyen` → chọn **Public** hoặc **Private** → **Create repository**.
3. Bấm **uploading an existing file** → kéo thả **toàn bộ nội dung** đã giải nén từ file zip (không kéo thư mục `node_modules` nếu có) → **Commit changes**.
4. Mở file `admin/config.yml` ngay trên GitHub → bấm biểu tượng bút chì → sửa dòng:
   ```
   repo: TEN-TAI-KHOAN-GITHUB/emma-ke-chuyen
   ```
   thành tên tài khoản GitHub thật, ví dụ `repo: tuyennt29/emma-ke-chuyen` → **Commit changes**.

## Bước 2 – Tạo website trên Netlify

1. Vào **app.netlify.com** → đăng nhập bằng GitHub.
2. **Add new site → Import an existing project → GitHub** → chọn repo `emma-ke-chuyen`.
3. Netlify tự đọc `netlify.toml` (lệnh build `npm run build`, thư mục `dist`). Bấm **Deploy**.
4. Sau 1–2 phút có địa chỉ dạng `ten-ngau-nhien.netlify.app`. Vào **Site configuration → Change site name** để đổi thành `emma-ke-chuyen` (nếu còn trống).

## Bước 3 – Bật đăng nhập trang Admin

1. Trên GitHub: ảnh đại diện → **Settings → Developer settings → OAuth Apps → New OAuth App**:
   - Application name: `Emma kể chuyện Admin`
   - Homepage URL: `https://emma-ke-chuyen.netlify.app` (địa chỉ thật của cậu chủ)
   - Authorization callback URL: `https://api.netlify.com/auth/done`
2. Bấm **Register** → copy **Client ID** → bấm **Generate a new client secret** → copy **Client secret**.
3. Trên Netlify: **Site configuration → Access & security → OAuth → Install provider → GitHub** → dán Client ID và Client secret → **Install**.
4. Mở `https://địa-chỉ-website/admin/` → **Login with GitHub**. Xong!

> Chỉ những tài khoản GitHub có quyền ghi vào repo mới đăng nhập được Admin. Muốn thêm người biên tập: GitHub repo → Settings → Collaborators → Add people.

## Bước 4 – Dùng trang Admin

- **Truyện → New Truyện**: nhập tên, thể loại, tóm tắt, ảnh bìa, rồi thêm từng chương ở mục **Các chương**. Bấm **Publish → Publish now**. Website tự cập nhật sau khoảng 1 phút.
- **Cài đặt → Thể loại (thư mục)**: thêm/bớt/đổi tên thể loại.
- **Cài đặt → Cài đặt website**: tên web, mô tả SEO, mã AdSense, video quảng cáo, link affiliate, cổng mở khóa.
- **Trang tĩnh**: sửa Giới thiệu, Chính sách bảo mật, Liên hệ.
- Muốn lưu nháp: bật **Bản nháp** trong truyện, truyện sẽ không hiện trên web.

## Bước 5 – Cổng mở khóa quảng cáo

- Mặc định chương **3, 5, 7…** của mỗi truyện có cổng (chỉnh trong *Cài đặt → Cổng mở khóa chương*).
- Độc giả chọn: **xem video quảng cáo** (mặc định 15 giây) hoặc **bấm link affiliate**. Sau đó chương mở trong 24 giờ trên thiết bị đó.
- **Video quảng cáo**: thêm mã video YouTube của nhà tài trợ (hoặc link file .mp4). Khi chưa có, trang hiển thị khung "Không gian dành cho nhà tài trợ".
- Nội dung chương vẫn nằm trong mã HTML và được khai báo theo chuẩn nội dung có khóa của Google, nên Google vẫn đọc và xếp hạng được chương này.

## Bước 6 – Tên miền & Google

1. **Tên miền**: mua tại nhà đăng ký (Mắt Bão, PA, Namecheap…) → Netlify: **Domain management → Add a domain** → làm theo hướng dẫn trỏ DNS. Netlify cấp HTTPS miễn phí.
2. **Google Search Console** (search.google.com/search-console): thêm website → chọn xác minh bằng *Thẻ HTML* → dán mã vào *Cài đặt → Mã xác minh Google Search Console* → xác minh → vào **Sitemaps** gửi `sitemap.xml`.
3. **Google AdSense**: đăng ký khi đã có tên miền riêng và khoảng 15–30 chương nội dung tự viết. Khi được duyệt, dán mã `ca-pub-…` và mã các slot vào *Cài đặt → Quảng cáo Google AdSense*. File `ads.txt` được tạo tự động.
4. **Google Analytics** (tùy chọn): dán mã `G-…` để theo dõi lượt đọc và số lần mở khóa (sự kiện `unlock_chapter`).

## SEO đã được làm sẵn

- Mỗi truyện, mỗi chương, mỗi thể loại có **URL riêng, không dấu**: `/truyen/ten-truyen/chuong-1/`.
- Thẻ `title`, `description`, `canonical`, Open Graph (chia sẻ Facebook/Zalo đẹp).
- Dữ liệu có cấu trúc schema.org: Book, Chapter, BreadcrumbList, WebSite + ô tìm kiếm.
- `sitemap.xml`, `robots.txt`, `feed.xml` (RSS) tự sinh mỗi lần đăng truyện.
- Trang HTML tĩnh, không cần JavaScript để đọc nội dung → tải nhanh, Google đọc dễ.

**Mẹo lên top:** tên truyện và tóm tắt chứa từ khóa người đọc hay tìm (ví dụ "truyện ngắn tình cảm", "truyện ma ngắn"); đăng đều mỗi tuần; chia sẻ link chương lên Facebook/nhóm đọc truyện; không đổi đường dẫn thể loại sau khi đã đặt.

## Chạy thử trên máy tính (không bắt buộc)

```
npm install
npm run build            # tạo website trong thư mục dist/
npm run admin-local      # cửa sổ 1: máy chủ admin nội bộ
npx serve dist           # cửa sổ 2: mở http://localhost:3000/admin/
```

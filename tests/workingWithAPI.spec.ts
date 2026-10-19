import { test, expect, request } from "@playwright/test";
import { tags } from "../test-data/tags.json";

test.beforeEach(async ({ page }) => {
  await page.route("*/**/api/tags", async (route) => {
    await route.fulfill({
      body: JSON.stringify(tags),
    });
  });

  await page.goto("https://conduit.bondaracademy.com/");
  await page.getByText("Sign in").click();
  await page.getByRole("textbox", { name: "Email" }).fill("test@gmasil.com");
  await page.getByRole("textbox", { name: "Password" }).fill("test12345");
  await page.getByRole("button").click();
});

test('has title', async ({ page }) => {
  await page.route('**/api/articles**', async (route) => {
    const response = await route.fetch();

    console.log('URL:', route.request().url());
    console.log(
      'Status:',
      response.status(),
      'Content-Type:',
      response.headers()['content-type']
    );

    const responseBody = await response.json();

    console.log('Original title:', responseBody.articles?.[0]?.title);

    if (responseBody.articles?.length > 0) {
      responseBody.articles[0].title = 'This is a test title';
      responseBody.articles[0].description =
        'This is a test description';
    }

    await route.fulfill({
      response,
      json: responseBody,
    });
  });

  await page.goto('https://conduit.bondaracademy.com/');

  await page.getByText('Global Feed').click();

  await expect(page.locator('.navbar-brand')).toContainText('conduit');

  const firstArticle = page.locator('app-article-preview').first();

  await expect(firstArticle).toContainText('This is a test title');
  await expect(firstArticle).toContainText('This is a test description');
});

test("delete article", async ({ page, request }) => {
  // 1. Login bằng API
  const loginResponse = await request.post(
    "https://conduit-api.bondaracademy.com/api/users/login",
    {
      data: {
        user: {
          email: "test@gmasil.com",
          password: "test12345",
        },
      },
    },
  );

  expect(loginResponse.status()).toBe(200);

  const loginBody = await loginResponse.json();
  const accessToken = loginBody.user.token;

  // 2. Tạo article bằng API với title duy nhất
  const articleTitle = `Delete test ${Date.now()}`;

  const articleResponse = await request.post(
    "https://conduit-api.bondaracademy.com/api/articles/",
    {
      data: {
        article: {
          title: articleTitle,
          description: "Create a post",
          body: "Create a body of the post",
          tagList: [],
        },
      },
      headers: {
        Authorization: `Token ${accessToken}`,
      },
    },
  );

  expect(articleResponse.status()).toBe(201);

  const articleBody = await articleResponse.json();
  const articleSlug = articleBody.article.slug;

  console.log("Created article:", articleTitle);
  console.log("Article slug:", articleSlug);

  // 3. Mở website và thiết lập token đăng nhập cho UI
  await page.goto("https://conduit.bondaracademy.com/");

  await page.evaluate((token) => {
    localStorage.setItem("jwtToken", token);
  }, accessToken);

  // Reload để ứng dụng đọc trạng thái đăng nhập
  await page.reload();

  // 4. Mở trực tiếp bài viết vừa tạo
  await page.goto(`https://conduit.bondaracademy.com/article/${articleSlug}`);

  await expect(page.locator("h1")).toHaveText(articleTitle);

  // 5. Xóa bài viết
  const deleteButtons = page.getByRole("button", {
    name: "Delete Article",
  });

  console.log("Number of delete buttons:", await deleteButtons.count());

  await expect(deleteButtons.first()).toBeVisible();
  await deleteButtons.first().click();

  // 6. Kiểm tra bài viết đã bị xóa
  await expect(page).toHaveURL(/\/$/);
});

test("create article", async ({ page, request }) => {
  // 1. Mở form tạo bài viết
  await page.getByText("New Article").click();

  // 2. Nhập thông tin bài viết
  const articleTitle = "This is a test title";
  const articleDescription = "This is a test description";
  const articleBody = "This is a test body";

  await page.getByRole("textbox", { name: "Article Title" }).fill(articleTitle);

  await page
    .getByRole("textbox", { name: "What's this article about?" })
    .fill(articleDescription);

  await page
    .getByRole("textbox", {
      name: "Write your article (in markdown)",
    })
    .fill(articleBody);

  await page.getByRole("textbox", { name: "Enter tags" }).fill("test");

  // 3. Chờ API tạo bài viết và click Publish
  const articleResponsePromise = page.waitForResponse(
    (response) =>
      response.url() ===
        "https://conduit-api.bondaracademy.com/api/articles/" &&
      response.request().method() === "POST",
  );

  await page.getByRole("button", { name: "Publish Article" }).click();

  const articleResponse = await articleResponsePromise;

  // 4. Kiểm tra API tạo bài viết thành công
  expect(articleResponse.status()).toBe(201);

  const articleResponseBody = await articleResponse.json();
  const slugId = articleResponseBody.article.slug;

  console.log("Created article slug:", slugId);

  // 5. Kiểm tra bài viết trên trang chi tiết
  await expect(page.locator(".article-page h1")).toHaveText(articleTitle);

  await expect(page.locator(".article-content")).toContainText(articleBody);

  // 6. Đăng nhập API để lấy access token
  const loginResponse = await request.post(
    "https://conduit-api.bondaracademy.com/api/users/login",
    {
      data: {
        user: {
          email: "test@gmasil.com",
          password: "test12345",
        },
      },
    },
  );

  expect(loginResponse.status()).toBe(200);

  const loginBody = await loginResponse.json();
  const accessToken = loginBody.user.token;

  // 7. Xóa bài viết vừa tạo bằng API
  const deleteResponse = await request.delete(
    `https://conduit-api.bondaracademy.com/api/articles/${slugId}`,
    {
      headers: {
        Authorization: `Token ${accessToken}`,
      },
    },
  );

  expect(deleteResponse.status()).toBe(204);

  console.log("Article deleted successfully:", slugId);
});

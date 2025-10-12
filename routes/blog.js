const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const { marked } = require("marked");

// Blog listesi
router.get("/", async (req, res) => {
    const posts = await req.commonModels.Blog.findAll({
        order: [["createdAt", "DESC"]],
    });

    res.render("blog-list", { posts });
});

// Tekil blog sayfası
router.get("/:slug", async (req, res) => {
    const post = await req.commonModels.Blog.findOne({
        where: { slug: req.params.slug},
    });

    if (!post) return res.status(404).render("404");

    const filePath = path.join(__dirname, "../public/blog/posts", post.fileName);
    let htmlContent = "";
    try {
        const md = fs.readFileSync(filePath, "utf8");
        htmlContent = marked.parse(md);
    } catch (err) {
        htmlContent = "<p>Yazı içeriği bulunamadı.</p>";
    }

    res.render("blog-post", {
        post,
        htmlContent,
    });
});

module.exports = router;

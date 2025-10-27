const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
    return sequelize.define("blog", {
        id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
        },

        title: {
            type: DataTypes.STRING,
            allowNull: false,
        },

        slug: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },

        fileName: {
            type: DataTypes.STRING,
            allowNull: false,
        },

        tags: {
            type: DataTypes.STRING,
            allowNull: true,
            get() {
                const raw = this.getDataValue("tags");
                return raw ? raw.split(",") : [];
            },
            set(val) {
                if (Array.isArray(val)) this.setDataValue("tags", val.join(","));
                else this.setDataValue("tags", val);
            },
        },

        seoTags: {
            type: DataTypes.STRING,
            allowNull: true,
            get() {
                const raw = this.getDataValue("tags");
                return raw ? raw.split(",") : [];
            },
            set(val) {
                if (Array.isArray(val)) this.setDataValue("tags", val.join(","));
                else this.setDataValue("tags", val);
            },
        },

        coverImage: {
            type: DataTypes.STRING,
            allowNull: true,
        },

        description: {
            type: DataTypes.STRING(300),
            allowNull: true,
        },

        viewCount: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },

        createdAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        updatedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
    });
};

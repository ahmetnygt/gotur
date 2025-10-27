const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
    return sequelize.define("user", {
        id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
        },
        idNumber: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        surname: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        email: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        phoneNumber: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        gender: {
            type: DataTypes.ENUM("m", "f"),
            allowNull: true,
        },
        nationality: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        customerType: {
            type: DataTypes.ENUM("adult", "child", "student", "disabled", "retired"),
            allowNull: true,
        },
        password: {
            type: DataTypes.STRING,
            allowNull: true,
        }
    });
};
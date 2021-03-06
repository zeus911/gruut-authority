module.exports = {
  up: (queryInterface, Sequelize) => queryInterface.createTable('Users', {
    nid: {
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
      type: Sequelize.INTEGER,
    },
    phone: {
      type: Sequelize.STRING,
    },
    role: {
      allowNull: false,
      type: Sequelize.INTEGER,
    },
    publicKey: {
      type: Sequelize.TEXT,
    },
    cert: {
      type: Sequelize.TEXT,
    },
    createdAt: {
      allowNull: false,
      type: Sequelize.DATE,
    },
    updatedAt: {
      allowNull: false,
      type: Sequelize.DATE,
    },
  }),
  down: queryInterface => queryInterface.dropTable('Users'),
};

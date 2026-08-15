module.exports = (sequelize, DataTypes) => {
  /**
   * A one-time sign-in link.
   *
   * Only the SHA-256 of the token is stored, the same as password reset, so a
   * database dump is not a pile of working credentials. Fifteen minutes rather
   * than an hour: this one hands over a session outright, where a reset link
   * still requires the person to choose a password.
   *
   * `requested_ip` is kept because the only realistic abuse of this endpoint is
   * mailbombing a known address, and a rate limiter that cannot be audited
   * afterwards is a guess.
   */
  const SignInLinkToken = sequelize.define('SignInLinkToken', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    token: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at'
    },
    usedAt: {
      type: DataTypes.DATE,
      field: 'used_at'
    },
    requestedIp: {
      type: DataTypes.STRING(64),
      field: 'requested_ip'
    }
  }, {
    tableName: 'sign_in_link_tokens',
    underscored: true,
    updatedAt: false,
    indexes: [
      { fields: ['token'] },
      { fields: ['user_id'] }
    ]
  });

  SignInLinkToken.associate = (models) => {
    SignInLinkToken.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return SignInLinkToken;
};

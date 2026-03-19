module.exports = {
  useAuthRequest: jest.fn(() => [null, null, jest.fn()]),
  makeRedirectUri: jest.fn(() => 'http://localhost'),
  ResponseType: { IdToken: 'id_token', Code: 'code' },
};

module.exports = {
  packagerConfig: {
    asar: true,
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
    },
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'ALiximber',
          name: 'VACACIONES',
        },
        prerelease: false,
        draft: true,
      },
    },
  ],
};

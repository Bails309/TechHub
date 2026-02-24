(async () => {
  try {
    await import('../src/app/admin/actions');
    console.log('import succeeded');
  } catch (err) {
    console.error('import failed:');
    if (err && err.stack) console.error(err.stack);
    else console.error(err);
    process.exit(1);
  }
})();

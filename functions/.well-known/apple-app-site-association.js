// Tells iOS that invite links (/join/CODE) open the Odd Birdle app when it is installed (Universal Links).
const body = {
  applinks: {
    details: [{ appIDs: ['C789GCURC5.com.yoyoyo.oddbirdle'], components: [{ '/': '/join/*' }] }]
  }
};

export function onRequest() {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' } });
}

// ====== Code.gs (fixed) ======
const SP = PropertiesService.getScriptProperties();
const NOTION_TOKEN = SP.getProperty('NOTION_TOKEN');
const DATABASE_ID  = (SP.getProperty('NOTION_DB_ID') || '').trim();

function doGet() {
  try {
    if (!NOTION_TOKEN || !DATABASE_ID) {
      return jsonError('Missing NOTION_TOKEN or NOTION_DB_ID in Script Properties');
    }

    const url = `https://api.notion.com/v1/databases/${normalizeDbId(DATABASE_ID)}/query`;
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({}), // フィルタ不要なら空
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28'
      },
      muteHttpExceptions: true
    });

    const code = res.getResponseCode();
    const text = res.getContentText();
    Logger.log(`Notion response: ${code}\n${text}`);

    if (code < 200 || code >= 300) {
      return jsonError(`Failed to query data source: Notion API Error: ${code} - ${text}`);
    }

    const json = JSON.parse(text);

    // ★列名は Notion の表示名と同じにする（大小文字含む）
    const items = (json.results || []).map(page => {
      const p = page.properties || {};
      return {
        videoId: getRichText(p.VideoID) || getTitle(p.VideoID) || '', // ← VideoID（D大文字）
        title:   getTitle(p.Title) || '',
        artist:  getRichText(p.Artist) || '',
        tags:    getMultiSelect(p.Tags)
      };
    }).filter(x => x.videoId);

    return jsonOk(items);

  } catch (e) {
    return jsonError(`Apps Script Error: ${e.message}`);
  }
}

// --- helpers ---
function normalizeDbId(id) {
  const m = (id || '').match(/[0-9a-fA-F]{32}/);
  return (m ? m[0] : id).toLowerCase();
}
function getTitle(prop){ return prop?.title?.[0]?.plain_text || ''; }
function getRichText(prop){ return prop?.rich_text?.[0]?.plain_text || ''; }
function getMultiSelect(prop){ return (prop?.multi_select || []).map(o => o.name); }

function jsonOk(payload){
  const out = ContentService.createTextOutput(JSON.stringify(payload));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}
function jsonError(message){
  const out = ContentService.createTextOutput(JSON.stringify({ error:true, message }));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}
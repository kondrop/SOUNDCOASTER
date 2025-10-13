const NOTION_API_KEY = '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';
const NOTION_DATABASE_ID = '1c9f75320d048097aeb3ff9da3840cd0';

// ウェブアプリケーションとしてGETリクエストを処理する関数
function doGet() {
  const data = fetchNotionData();
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// Notionからデータを取得する関数
function fetchNotionData() {
  const url = `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`;
  const options = {
    'method': 'post',
    'headers': {
      'Authorization': `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    'muteHttpExceptions': true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const data = JSON.parse(response.getContentText());
    
    // Notionのデータを必要な形式に変換
    return data.results.map(page => {
      // 各プロパティが存在するか確認しつつ取得
      const title = page.properties.Title?.title[0]?.plain_text || 'Untitled';
      const videoId = page.properties.VideoID?.rich_text[0]?.plain_text || '';
      const artist = page.properties.Artist?.rich_text[0]?.plain_text || 'Unknown Artist';
      // Tags (マルチセレクト) プロパティを取得し、タグ名の配列に変換
      const tags = page.properties.Tags?.multi_select?.map(tag => tag.name) || []; 
      
      return {
        title: title,
        videoId: videoId,
        artist: artist,
        tags: tags // tags配列を追加
      };
    }).filter(item => item.videoId); // videoIdがないものは除外
    
  } catch (error) {
    return {
      error: true,
      message: error.toString()
    };
  }
} 
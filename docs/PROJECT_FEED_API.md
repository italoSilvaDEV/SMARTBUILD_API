# 📸 Project Feed API - Documentação Completa

Sistema de feed de projetos similar ao CompanyCam, permitindo que funcionários capturem e compartilhem fotos, vídeos e atualizações dos projetos em tempo real.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Recursos Principais](#recursos-principais)
- [Endpoints da API](#endpoints-da-api)
  - [Project Feed](#project-feed)
  - [Comentários](#comentários)
  - [Reações](#reações)
  - [QR Codes](#qr-codes)
  - [Compartilhamento](#compartilhamento)
- [Exemplos de Uso](#exemplos-de-uso)
- [Fluxo para App Mobile](#fluxo-para-app-mobile)

---

## 🎯 Visão Geral

O **Project Feed** é um sistema completo de documentação visual e temporal de projetos que permite:

- ✅ Captura ilimitada de fotos e vídeos
- 📍 Geolocalização automática de mídias
- ⏰ Timestamp automático
- 💬 Sistema de comentários
- 😊 Reações (emojis)
- 🔗 Compartilhamento público com clientes
- 📱 QR Code para acesso rápido via mobile
- 📊 Estatísticas e analytics

---

## ⚡ Recursos Principais

### 1. **Upload de Mídia Ilimitado**
- Suporte para fotos (JPEG, PNG, WebP)
- Suporte para vídeos (MP4, MOV)
- Upload automático para AWS S3
- Geração de thumbnails para vídeos
- Compressão automática de imagens

### 2. **Geolocalização Automática**
- Captura de latitude/longitude
- Endereço reverso (geocoding)
- Exibição em mapa

### 3. **Timeline do Projeto**
- Visualização cronológica de todas as atualizações
- Filtros por tipo (foto, vídeo, nota, check-in)
- Scroll infinito

### 4. **Compartilhamento Seguro**
- Links públicos com token único
- Proteção por senha opcional
- Data de expiração configurável
- Controle de download
- Filtros de conteúdo

### 5. **QR Code por Projeto**
- Código único por projeto
- Acesso rápido via escaneamento
- Contadores de uso
- Possibilidade de impressão

---

## 🔌 Endpoints da API

### Base URL
```
https://api.smartbuild.com/api
```

---

## 📸 Project Feed

### **1. Criar Post no Feed**

**POST** `/projects/:projectId/feed`

Cria um novo post no feed do projeto com fotos/vídeos.

**Headers:**
```json
{
  "Authorization": "Bearer {token}",
  "Content-Type": "multipart/form-data"
}
```

**Body (Form-Data):**
```
files: File[] (Max 10 arquivos, 100MB cada)
type: string (PHOTO | VIDEO | NOTE | UPDATE | CHECKIN)
title: string (opcional)
description: string (opcional)
latitude: number (opcional)
longitude: number (opcional)
address: string (opcional)
isPublic: boolean (opcional)
authorId: string (obrigatório)
deviceInfo: string (opcional)
```

**Exemplo Request:**
```javascript
const formData = new FormData();
formData.append('files', photoFile);
formData.append('type', 'PHOTO');
formData.append('title', 'Fundação concluída');
formData.append('description', 'Primeira fase finalizada com sucesso');
formData.append('latitude', '37.7749');
formData.append('longitude', '-122.4194');
formData.append('isPublic', 'true');
formData.append('authorId', 'user-id-123');

fetch('/projects/project-id-456/feed', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer token'
  },
  body: formData
});
```

**Response 201:**
```json
{
  "id": "feed-id-789",
  "type": "PHOTO",
  "title": "Fundação concluída",
  "description": "Primeira fase finalizada com sucesso",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "address": "123 Main St, San Francisco, CA",
  "isPublic": true,
  "viewCount": 0,
  "projectId": "project-id-456",
  "authorId": "user-id-123",
  "author": {
    "id": "user-id-123",
    "name": "João Silva",
    "avatar": "https://..."
  },
  "media": [
    {
      "id": "media-id-001",
      "url": "https://s3.amazonaws.com/...",
      "thumbnailUrl": "https://s3.amazonaws.com/...",
      "type": "IMAGE",
      "width": 1920,
      "height": 1080,
      "fileSize": 2048576,
      "capturedAt": "2024-11-01T10:30:00.000Z"
    }
  ],
  "comments": [],
  "reactions": [],
  "date_creation": "2024-11-01T10:30:00.000Z",
  "date_update": "2024-11-01T10:30:00.000Z"
}
```

---

### **2. Listar Feed do Projeto**

**GET** `/projects/:projectId/feed`

Lista todos os posts do feed de um projeto.

**Query Params:**
- `page` (number): Página atual (padrão: 1)
- `limit` (number): Items por página (padrão: 20)
- `type` (string): Filtrar por tipo (PHOTO, VIDEO, NOTE, etc.)

**Exemplo:**
```
GET /projects/project-id-456/feed?page=1&limit=20&type=PHOTO
```

**Response 200:**
```json
{
  "data": [
    {
      "id": "feed-id-789",
      "type": "PHOTO",
      "title": "Fundação concluída",
      "author": {
        "id": "user-id-123",
        "name": "João Silva",
        "avatar": "https://..."
      },
      "media": [...],
      "comments": [...],
      "reactions": [...],
      "_count": {
        "comments": 5,
        "reactions": 12
      },
      "date_creation": "2024-11-01T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

---

### **3. Obter Post Específico**

**GET** `/projects/feed/:feedId`

Busca um post específico do feed.

**Response 200:**
```json
{
  "id": "feed-id-789",
  "type": "PHOTO",
  "title": "Fundação concluída",
  "description": "...",
  "author": {...},
  "media": [...],
  "comments": [...],
  "reactions": [...],
  "project": {
    "id": "project-id-456",
    "status_project": "EM_ANDAMENTO",
    "client": {
      "id": "client-id-123",
      "name": "Cliente ABC"
    }
  },
  "viewCount": 25,
  "date_creation": "2024-11-01T10:30:00.000Z"
}
```

---

### **4. Atualizar Post**

**PUT** `/projects/feed/:feedId`

Atualiza informações de um post.

**Body:**
```json
{
  "title": "Novo título",
  "description": "Nova descrição",
  "isPublic": false
}
```

**Response 200:** Retorna o post atualizado.

---

### **5. Deletar Post**

**DELETE** `/projects/feed/:feedId`

Deleta um post e suas mídias do S3.

**Response 200:**
```json
{
  "message": "Post deletado com sucesso"
}
```

---

### **6. Estatísticas do Feed**

**GET** `/projects/:projectId/feed/stats`

Obtém estatísticas do feed do projeto.

**Response 200:**
```json
{
  "totalPosts": 150,
  "totalPhotos": 120,
  "totalVideos": 30,
  "totalComments": 250,
  "totalReactions": 500,
  "recentPosts": [
    {
      "id": "feed-id-001",
      "type": "PHOTO",
      "date_creation": "2024-11-01T10:30:00.000Z"
    }
  ]
}
```

---

## 💬 Comentários

### **1. Adicionar Comentário**

**POST** `/projects/feed/:feedId/comments`

Adiciona um comentário a um post.

**Body:**
```json
{
  "text": "Excelente trabalho!",
  "authorId": "user-id-123"
}
```

**Response 201:**
```json
{
  "id": "comment-id-001",
  "text": "Excelente trabalho!",
  "projectFeedId": "feed-id-789",
  "authorId": "user-id-123",
  "author": {
    "id": "user-id-123",
    "name": "João Silva",
    "avatar": "https://..."
  },
  "date_creation": "2024-11-01T11:00:00.000Z"
}
```

---

### **2. Deletar Comentário**

**DELETE** `/projects/feed/comments/:commentId`

Remove um comentário.

**Response 200:**
```json
{
  "message": "Comentário deletado com sucesso"
}
```

---

## 😊 Reações

### **1. Toggle Reação**

**POST** `/projects/feed/:feedId/reactions`

Adiciona ou remove uma reação (toggle).

**Body:**
```json
{
  "emoji": "👍",
  "userId": "user-id-123"
}
```

**Response 201 (adicionada):**
```json
{
  "message": "Reação adicionada",
  "action": "added",
  "reaction": {
    "id": "reaction-id-001",
    "emoji": "👍",
    "user": {
      "id": "user-id-123",
      "name": "João Silva"
    }
  }
}
```

**Response 200 (removida):**
```json
{
  "message": "Reação removida",
  "action": "removed"
}
```

---

## 📱 QR Codes

### **1. Gerar/Obter QR Code**

**POST** `/projects/:projectId/qrcode`

Gera ou retorna o QR Code existente do projeto.

**Body:**
```json
{
  "userId": "user-id-123"
}
```

**Response 201:**
```json
{
  "id": "qr-id-001",
  "code": "abc123def456",
  "qrCodeUrl": null,
  "isActive": true,
  "scans": 0,
  "projectId": "project-id-456",
  "createdById": "user-id-123",
  "project": {
    "id": "project-id-456",
    "status_project": "EM_ANDAMENTO",
    "location": "123 Main St",
    "client": {
      "name": "Cliente ABC"
    }
  },
  "date_creation": "2024-11-01T12:00:00.000Z"
}
```

---

### **2. Validar QR Code (Sem Auth)**

**GET** `/projects/qrcode/:code`

Valida e acessa projeto via QR Code. **Não requer autenticação** para uso mobile.

**Response 200:**
```json
{
  "qrCode": {
    "id": "qr-id-001",
    "code": "abc123def456",
    "scans": 5,
    "isActive": true
  },
  "project": {
    "id": "project-id-456",
    "status_project": "EM_ANDAMENTO",
    "location": "123 Main St",
    "client": {
      "name": "Cliente ABC",
      "email": "cliente@example.com",
      "phone": "+1234567890"
    },
    "company": {
      "name": "Construtora XYZ"
    },
    "serviceProject": [...]
  }
}
```

---

### **3. Desativar QR Code**

**PUT** `/projects/qrcode/:code/deactivate`

Desativa um QR Code.

**Response 200:** Retorna o QR Code atualizado.

---

### **4. Ativar QR Code**

**PUT** `/projects/qrcode/:code/activate`

Ativa um QR Code.

**Response 200:** Retorna o QR Code atualizado.

---

### **5. Regenerar QR Code**

**POST** `/projects/:projectId/qrcode/regenerate`

Gera um novo código para o projeto.

**Body:**
```json
{
  "userId": "user-id-123"
}
```

**Response 200:** Retorna o QR Code com novo código.

---

### **6. Estatísticas do QR Code**

**GET** `/projects/:projectId/qrcode/stats`

Obtém estatísticas de uso do QR Code.

**Response 200:**
```json
{
  "totalScans": 25,
  "lastScannedAt": "2024-11-01T14:30:00.000Z",
  "isActive": true,
  "createdAt": "2024-10-15T10:00:00.000Z",
  "createdBy": {
    "id": "user-id-123",
    "name": "João Silva"
  }
}
```

---

### **7. Dados para Impressão**

**GET** `/projects/:projectId/qrcode/print`

Obtém dados formatados para impressão do QR Code.

**Response 200:**
```json
{
  "code": "abc123def456",
  "url": "https://app.smartbuild.com/scan/abc123def456",
  "project": {
    "client": "Cliente ABC",
    "location": "123 Main St, San Francisco, CA",
    "company": "Construtora XYZ",
    "companyLogo": "https://..."
  },
  "instructions": "Escaneie este código QR para acessar rapidamente as informações do projeto"
}
```

---

## 🔗 Compartilhamento

### **1. Criar Link de Compartilhamento**

**POST** `/projects/:projectId/feed/share`

Cria um link público para compartilhar o feed com clientes.

**Body:**
```json
{
  "userId": "user-id-123",
  "expiresIn": 30,
  "password": "senha123",
  "allowDownload": true,
  "includeTypes": ["PHOTO", "VIDEO"],
  "startDate": "2024-10-01",
  "endDate": "2024-11-01"
}
```

**Response 201:**
```json
{
  "id": "share-id-001",
  "shareToken": "xyz789abc456def",
  "shareUrl": "https://app.smartbuild.com/shared-feed/xyz789abc456def",
  "expiresAt": "2024-12-01T00:00:00.000Z",
  "allowDownload": true,
  "views": 0,
  "createdBy": {
    "id": "user-id-123",
    "name": "João Silva"
  },
  "date_creation": "2024-11-01T15:00:00.000Z"
}
```

---

### **2. Acessar Feed Compartilhado (Público)**

**POST** `/projects/feed/shared/:token`

Acessa um feed compartilhado. **Não requer autenticação.**

**Body (se tiver senha):**
```json
{
  "password": "senha123"
}
```

**Response 200:**
```json
{
  "project": {
    "client": "Cliente ABC",
    "location": "123 Main St",
    "company": {
      "name": "Construtora XYZ",
      "avatar": "https://..."
    }
  },
  "allowDownload": true,
  "posts": [
    {
      "id": "feed-id-001",
      "type": "PHOTO",
      "title": "...",
      "media": [...],
      "_count": {
        "comments": 5,
        "reactions": 12
      }
    }
  ],
  "totalViews": 15
}
```

**Response 401 (senha necessária):**
```json
{
  "error": "Senha necessária",
  "requiresPassword": true
}
```

---

### **3. Listar Compartilhamentos**

**GET** `/projects/:projectId/feed/shares`

Lista todos os compartilhamentos de um projeto.

**Response 200:**
```json
[
  {
    "id": "share-id-001",
    "shareToken": "xyz789abc456def",
    "shareUrl": "https://app.smartbuild.com/shared-feed/xyz789abc456def",
    "expiresAt": "2024-12-01T00:00:00.000Z",
    "password": "***",
    "isExpired": false,
    "allowDownload": true,
    "views": 25,
    "createdBy": {
      "id": "user-id-123",
      "name": "João Silva"
    },
    "date_creation": "2024-11-01T15:00:00.000Z"
  }
]
```

---

### **4. Atualizar Compartilhamento**

**PUT** `/projects/feed/share/:shareId`

Atualiza configurações de um compartilhamento.

**Body:**
```json
{
  "expiresIn": 60,
  "password": "novaSenha123",
  "allowDownload": false
}
```

**Response 200:** Retorna o compartilhamento atualizado.

---

### **5. Deletar Compartilhamento**

**DELETE** `/projects/feed/share/:shareId`

Remove um link de compartilhamento.

**Response 200:**
```json
{
  "message": "Compartilhamento deletado com sucesso"
}
```

---

### **6. Estatísticas de Compartilhamento**

**GET** `/projects/feed/share/:shareId/stats`

Obtém estatísticas de um compartilhamento.

**Response 200:**
```json
{
  "totalViews": 150,
  "createdAt": "2024-11-01T15:00:00.000Z",
  "expiresAt": "2024-12-01T00:00:00.000Z",
  "isExpired": false,
  "hasPassword": true,
  "allowDownload": false,
  "createdBy": "João Silva"
}
```

---

## 📱 Fluxo para App Mobile

### **Cenário 1: Funcionário Captura Foto no Canteiro**

1. Funcionário abre o app mobile
2. Escaneia o QR Code do projeto (ou seleciona da lista)
3. Abre a câmera integrada
4. Tira foto com captura automática de localização
5. Adiciona título/descrição opcional
6. Clica em "Postar"
7. App faz upload via endpoint `POST /projects/:projectId/feed`

**Código Exemplo (React Native):**

```javascript
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';

async function captureAndUpload(projectId, userId) {
  // 1. Capturar localização
  const location = await Location.getCurrentPositionAsync({});
  
  // 2. Tirar foto
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.All,
    quality: 0.8,
  });
  
  if (!result.canceled) {
    // 3. Preparar FormData
    const formData = new FormData();
    formData.append('files', {
      uri: result.assets[0].uri,
      type: 'image/jpeg',
      name: 'photo.jpg',
    });
    formData.append('type', 'PHOTO');
    formData.append('authorId', userId);
    formData.append('latitude', location.coords.latitude);
    formData.append('longitude', location.coords.longitude);
    formData.append('deviceInfo', `${Platform.OS} ${Platform.Version}`);
    
    // 4. Upload
    const response = await fetch(
      `https://api.smartbuild.com/api/projects/${projectId}/feed`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      }
    );
    
    const data = await response.json();
    console.log('Upload sucesso:', data);
  }
}
```

---

### **Cenário 2: Cliente Acessa Feed Compartilhado**

1. Cliente recebe link por email/SMS: `https://app.smartbuild.com/shared-feed/xyz789`
2. Acessa o link no navegador
3. Se protegido, digita a senha
4. Visualiza timeline do projeto com fotos/vídeos
5. Pode fazer download se permitido

**Código Exemplo (Web):**

```javascript
async function accessSharedFeed(token, password) {
  const response = await fetch(
    `https://api.smartbuild.com/api/projects/feed/shared/${token}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    }
  );
  
  if (response.status === 401) {
    const data = await response.json();
    if (data.requiresPassword) {
      // Mostrar input de senha
      showPasswordPrompt();
    }
  } else {
    const data = await response.json();
    // Exibir posts do feed
    renderFeed(data.posts);
  }
}
```

---

### **Cenário 3: Acesso via QR Code**

1. Funcionário escaneia QR Code impresso no canteiro
2. App detecta o código
3. Chama endpoint `GET /projects/qrcode/:code`
4. App navega diretamente para o projeto
5. Funcionário pode imediatamente postar fotos/atualizações

**Código Exemplo:**

```javascript
import { BarCodeScanner } from 'expo-barcode-scanner';

function QRScanner({ navigation }) {
  const handleBarCodeScanned = async ({ data }) => {
    // data = "abc123def456" (o código do QR)
    
    const response = await fetch(
      `https://api.smartbuild.com/api/projects/qrcode/${data}`
    );
    
    const { project } = await response.json();
    
    // Navegar para o projeto
    navigation.navigate('ProjectFeed', { 
      projectId: project.id,
      projectName: project.client.name 
    });
  };
  
  return (
    <BarCodeScanner
      onBarCodeScanned={handleBarCodeScanned}
      style={StyleSheet.absoluteFillObject}
    />
  );
}
```

---

## 🔒 Segurança

- ✅ Autenticação via JWT para rotas protegidas
- ✅ Validação de permissões por projeto
- ✅ URLs assinadas para acesso ao S3
- ✅ Rate limiting em uploads
- ✅ Validação de tipos de arquivo
- ✅ Proteção contra XSS e SQL Injection
- ✅ Links compartilhados com token único
- ✅ Suporte para senha e expiração

---

## 📊 Performance

- ✅ Paginação em todas as listagens
- ✅ Lazy loading de mídias
- ✅ Thumbnails para vídeos
- ✅ Compressão de imagens
- ✅ CDN via CloudFront (S3)
- ✅ Cache de queries frequentes
- ✅ Índices otimizados no banco

---

## 🚀 Próximas Melhorias

- [ ] Upload em background com retry
- [ ] Edição de fotos no app (filtros, crop)
- [ ] Anotações em fotos (desenhar, adicionar texto)
- [ ] Modo dual-câmera (frente + trás)
- [ ] Reconhecimento de imagens com IA
- [ ] Comparação before/after
- [ ] Exportação de relatório em PDF
- [ ] Integração com Google Maps
- [ ] Notificações push
- [ ] Modo offline

---

## 📞 Suporte

Para dúvidas ou problemas, entre em contato:
- Email: suporte@smartbuild.com
- Documentação: https://docs.smartbuild.com

---

**Desenvolvido com ❤️ pela equipe SMARTBUILD**


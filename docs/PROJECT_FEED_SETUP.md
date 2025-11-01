# 🚀 Setup do Project Feed - Guia de Instalação

## 📋 Pré-requisitos

- Node.js 18+
- MySQL 8.0+
- NPM ou Yarn
- Arquivo `.env` configurado

---

## 🔧 Passo 1: Instalar Dependências

```bash
npm install qrcode @types/qrcode --save
```

---

## 🗄️ Passo 2: Executar Migrations

### 2.1. Criar Migration

Certifique-se de que o arquivo `.env` está configurado com `DATABASE_URL`:

```bash
DATABASE_URL="mysql://usuario:senha@localhost:3306/smartbuild"
```

### 2.2. Gerar e Aplicar Migration

```bash
npx prisma migrate dev --name add_project_feed_feature
```

Isso irá criar as seguintes tabelas:
- `project_feed`
- `project_media`
- `project_feed_comment`
- `project_feed_reaction`
- `project_qr_code`
- `project_feed_share`

### 2.3. Gerar Prisma Client

```bash
npx prisma generate
```

---

## 📁 Passo 3: Criar Diretórios Temporários

Criar diretórios necessários para upload temporário:

```bash
mkdir -p tmp/project-feed
mkdir -p tmp/qrcodes
```

---

## 🌍 Passo 4: Configurar Variáveis de Ambiente

Adicione ao seu arquivo `.env`:

```env
# AWS S3 (já deve estar configurado)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
AWS_BUCKET_NAME=smartbuild-uploads

# App URL (para QR Codes e compartilhamentos)
APP_URL=https://app.smartbuild.com

# Opcional: Configurações de upload
MAX_FILE_SIZE=104857600  # 100MB em bytes
MAX_FILES_PER_UPLOAD=10
```

---

## ✅ Passo 5: Testar a API

### 5.1. Iniciar o Servidor

```bash
npm run dev
```

### 5.2. Testar Endpoints

#### Criar Post no Feed (com Postman ou cURL):

```bash
curl -X POST http://localhost:3000/api/projects/PROJECT_ID/feed \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "files=@/path/to/photo.jpg" \
  -F "type=PHOTO" \
  -F "title=Teste de Upload" \
  -F "authorId=USER_ID" \
  -F "isPublic=true"
```

#### Listar Feed:

```bash
curl -X GET http://localhost:3000/api/projects/PROJECT_ID/feed \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Gerar QR Code:

```bash
curl -X POST http://localhost:3000/api/projects/PROJECT_ID/qrcode \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId": "USER_ID"}'
```

---

## 📱 Passo 6: Integrar com App Mobile

### 6.1. Instalar Dependências (React Native)

```bash
npm install expo-camera expo-location expo-image-picker
```

### 6.2. Exemplo de Componente

```jsx
import React, { useState } from 'react';
import { View, Button, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

export default function ProjectFeedUpload({ projectId, userId, token }) {
  const [uploading, setUploading] = useState(false);

  const captureAndUpload = async () => {
    // Solicitar permissões
    const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
    const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();

    if (cameraStatus !== 'granted' || locationStatus !== 'granted') {
      alert('Permissões necessárias não concedidas');
      return;
    }

    // Capturar localização
    const location = await Location.getCurrentPositionAsync({});

    // Tirar foto
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      exif: true,
    });

    if (!result.canceled) {
      setUploading(true);

      // Preparar FormData
      const formData = new FormData();
      formData.append('files', {
        uri: result.assets[0].uri,
        type: 'image/jpeg',
        name: 'photo.jpg',
      });
      formData.append('type', 'PHOTO');
      formData.append('authorId', userId);
      formData.append('latitude', location.coords.latitude.toString());
      formData.append('longitude', location.coords.longitude.toString());
      formData.append('isPublic', 'true');

      try {
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
        alert('Foto enviada com sucesso!');
      } catch (error) {
        console.error('Erro no upload:', error);
        alert('Erro ao enviar foto');
      } finally {
        setUploading(false);
      }
    }
  };

  return (
    <View>
      <Button 
        title={uploading ? "Enviando..." : "Tirar Foto"} 
        onPress={captureAndUpload}
        disabled={uploading}
      />
    </View>
  );
}
```

---

## 🔍 Passo 7: Implementar Scanner de QR Code

```jsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';

export default function QRCodeScanner({ navigation }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleBarCodeScanned = async ({ type, data }) => {
    setScanned(true);

    try {
      // Validar QR Code
      const response = await fetch(
        `https://api.smartbuild.com/api/projects/qrcode/${data}`
      );

      const result = await response.json();

      // Navegar para o projeto
      navigation.navigate('ProjectDetail', {
        projectId: result.project.id,
        projectData: result.project,
      });
    } catch (error) {
      alert('QR Code inválido');
    }

    setTimeout(() => setScanned(false), 2000);
  };

  if (hasPermission === null) {
    return <Text>Solicitando permissão da câmera...</Text>;
  }

  if (hasPermission === false) {
    return <Text>Sem acesso à câmera</Text>;
  }

  return (
    <View style={styles.container}>
      <BarCodeScanner
        onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
        style={StyleSheet.absoluteFillObject}
      />
      {scanned && <Text style={styles.text}>QR Code Escaneado!</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  text: {
    fontSize: 18,
    color: 'white',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 16,
  },
});
```

---

## 📊 Passo 8: Monitoramento e Logs

### 8.1. Verificar Uploads

```sql
-- Ver posts recentes
SELECT 
  pf.id,
  pf.type,
  pf.title,
  u.name as author,
  p.status_project,
  pf.date_creation
FROM project_feed pf
JOIN User u ON pf.authorId = u.id
JOIN project p ON pf.projectId = p.id
ORDER BY pf.date_creation DESC
LIMIT 20;
```

### 8.2. Ver Estatísticas

```sql
-- Estatísticas por projeto
SELECT 
  p.id,
  c.name as client,
  COUNT(pf.id) as total_posts,
  SUM(CASE WHEN pf.type = 'PHOTO' THEN 1 ELSE 0 END) as photos,
  SUM(CASE WHEN pf.type = 'VIDEO' THEN 1 ELSE 0 END) as videos
FROM project p
LEFT JOIN project_feed pf ON p.id = pf.projectId
LEFT JOIN Client c ON p.client_id = c.id
GROUP BY p.id, c.name
HAVING total_posts > 0
ORDER BY total_posts DESC;
```

---

## 🔐 Passo 9: Segurança

### 9.1. Configurar CORS

No arquivo `server.ts`, adicione:

```typescript
import cors from 'cors';

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

### 9.2. Rate Limiting

```bash
npm install express-rate-limit
```

```typescript
import rateLimit from 'express-rate-limit';

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 50, // 50 uploads por 15 min
  message: 'Muitos uploads. Tente novamente mais tarde.'
});

app.use('/api/projects/:projectId/feed', uploadLimiter);
```

---

## 🎯 Passo 10: Otimizações

### 10.1. Compressão de Imagens

O sistema já está configurado com `sharp` para compressão automática.

### 10.2. CDN CloudFront

Configure o CloudFront na frente do S3:

```env
CDN_URL=https://d1234567890.cloudfront.net
```

E ajuste no código:

```typescript
const publicUrl = process.env.CDN_URL 
  ? s3Url.replace(process.env.AWS_BUCKET_URL, process.env.CDN_URL)
  : s3Url;
```

---

## 📱 Recursos Mobile Recomendados

### iOS e Android

- **Câmera nativa**: Use `expo-camera` ou `react-native-camera`
- **Localização**: `@react-native-community/geolocation` ou `expo-location`
- **Upload em background**: `react-native-background-upload`
- **Compressão**: `react-native-image-resizer`
- **QR Scanner**: `expo-barcode-scanner` ou `react-native-qrcode-scanner`

---

## 🐛 Troubleshooting

### Problema: Upload falha com erro 413

**Solução:** Aumentar limite de upload no Nginx:

```nginx
client_max_body_size 100M;
```

### Problema: Imagens não aparecem

**Solução:** Verificar políticas do S3:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::seu-bucket/*"
    }
  ]
}
```

### Problema: QR Code não escaneia

**Solução:** 
- Verificar se o código está no formato correto
- Garantir boa iluminação
- Testar com apps de QR Code genéricos primeiro

---

## 📞 Suporte

Se encontrar problemas:

1. Verifique os logs: `tail -f logs/error.log`
2. Teste os endpoints com Postman
3. Verifique as permissões do S3
4. Consulte a documentação completa em `/docs/PROJECT_FEED_API.md`

---

## ✅ Checklist de Implantação

- [ ] Dependências instaladas
- [ ] Migrations executadas
- [ ] Diretórios criados
- [ ] Variáveis de ambiente configuradas
- [ ] S3 configurado e testado
- [ ] Endpoints testados
- [ ] App mobile integrado
- [ ] QR Codes funcionando
- [ ] Compartilhamento testado
- [ ] Monitoramento ativo

---

**Parabéns! 🎉 O Project Feed está pronto para uso!**


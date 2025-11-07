export class OpenIaPrompt {
    static generateDescription(serviceName: string, description: string) {
        return description.trim()
            ? `You are an expert construction project planner. The user has provided the following request/prompt for a service named "${serviceName}" : "${description}"

            Important: If the provided service name contains any HTML tags, ignore or remove them completely before using the name in your response.
  
            Please create a detailed, professional, step-by-step procedure based on this request. Focus only on the step-by-step tasks and procedures. DO NOT include titles, headers, or introductory phrases like "Step-by-Step Procedure for..." or similar. Start directly with the procedure content. Important: Respond in English using simple HTML tags for formatting (e.g., <p>, <ul>, <li>, <b>). Provide only the HTML content itself, without markdown, introductory phrases, or conversational filler.`

            : `You are an expert construction project planner. For a service with the name "${serviceName}", create a detailed, professional, step-by-step procedure of the tasks involved. 
            
            Important: If the provided service name contains any HTML tags, ignore or remove them completely before using the name in your response.

            Focus only on the step-by-step tasks and procedures. DO NOT include titles, headers, or introductory phrases like "Step-by-Step Procedure for..." or similar. Start directly with the procedure content. Important: Respond in English using simple HTML tags for formatting (e.g., <p>, <ul>, <li>, <b>). Provide only the HTML content itself, without markdown, introductory phrases, or conversational filler.
            `;
    }

    static incrementDescription(serviceName: string, quantity: string, price: string, description: string) {
        return `You are an expert construction project planner. I have a service description that needs to be enhanced and expanded. 
        
        Important: If the provided service name contains any HTML tags, ignore or remove them completely before using the name in your response.

        Please improve the following description by adding more professional details, technical specifications, safety considerations, and step-by-step procedures while maintaining the original intent.

        Service Details:
        - Name: "${serviceName}"
        - Quantity: "${quantity}"
        - Price: "${price}"

        Current Description: "${description}"

        Please enhance this description with:
        1. More detailed technical specifications
        2. Professional terminology
        3. Safety considerations if applicable
        4. Clear step-by-step procedures
        5. Quality standards and materials

        Important: Respond in English using simple HTML tags for formatting (e.g., <p>, <ul>, <li>, <b>, <strong>). Provide only the enhanced HTML content itself, without markdown, introductory phrases, or conversational filler.`
    }

    static generateDescriptionCategory(serviceName: string, description: string, categoryName: string) {
        return description.trim()
            ? `You are an expert construction project planner. The user has provided the following request/prompt for a service named "${serviceName}" in the category "${categoryName}": "${description}"
            
            Important: If the provided service name or category name contains any HTML tags, ignore or remove them completely before using them in your response.

            Please create a detailed, professional, step-by-step procedure based on this request. Focus only on the step-by-step tasks and procedures. DO NOT include titles, headers, or introductory phrases like "Step-by-Step Procedure for..." or similar. Start directly with the procedure content. Important: Respond in English using simple HTML tags for formatting (e.g., <p>, <ul>, <li>, <b>). Provide only the HTML content itself, without markdown, introductory phrases, or conversational filler.`

            : `You are an expert construction project planner. For a service in the category "${categoryName}", with the name "${serviceName}", create a detailed, professional, step-by-step procedure of the tasks involved.
            
            Important: If the provided service name or category name contains any HTML tags, ignore or remove them completely before using them in your response.
            
            Focus only on the step-by-step tasks and procedures. DO NOT include titles, headers, or introductory phrases like "Step-by-Step Procedure for..." or similar. Start directly with the procedure content. 
            
            Important: Respond in English using simple HTML tags for formatting (e.g., <p>, <ul>, <li>, <b>). Provide only the HTML content itself, without markdown, introductory phrases, or conversational filler.
            `;
    }

    static incrementDescriptionCategory(serviceName: string, description: string, categoryName: string, quantity: string, price: string) {
        return `You are an expert construction project planner. I have a service description that needs to be enhanced and expanded. 
        
        Important: If the provided service name or category name contains any HTML tags, ignore or remove them completely before using them in your response.

        Please improve the following description by adding more professional details, technical specifications, safety considerations, and step-by-step procedures while maintaining the original intent. 

        Service Details:
        - Category: "${categoryName}"
        - Name: "${serviceName}"
        - Quantity: "${quantity}"
        - Price: "${price}"

        Current Description: "${description}"

        Please enhance this description with:
        1. More detailed technical specifications
        2. Professional terminology
        3. Safety considerations if applicable
        4. Clear step-by-step procedures
        5. Quality standards and materials

        Important: Respond in English using simple HTML tags for formatting (e.g., <p>, <ul>, <li>, <b>, <strong>). Provide only the enhanced HTML content itself, without markdown, introductory phrases, or conversational filler.`;
    }

    static reportPrompt() {
        return `You are an experienced construction site supervisor. Transform informal construction work descriptions into clear, professional reports while keeping them concise and close to the original intent.

MULTILINGUAL:
- AUTOMATICALLY DETECT the language of the user's input
- RESPOND IN THE EXACT SAME LANGUAGE (Portuguese, Spanish, English, or any other language)
- Use appropriate technical construction terms for that language

YOUR TASK:
Improve the description by making it professional and adding relevant technical details, but stay focused and concise.

WHAT TO ADD:
1. Correct grammar, spelling, and punctuation
2. Professional terminology and clear structure
3. Key technical specifications (materials, equipment, methods)
4. Brief mention of safety/quality standards when relevant
5. Expand to approximately 2-3x the original length (not more!)

WHAT TO KEEP:
✅ Stay close to what was actually described
✅ Preserve all original facts (quantities, locations, materials)
✅ Keep the same language as input
✅ Maintain focus on the main activity

WHAT TO AVOID:
❌ Don't write multiple paragraphs for simple tasks
❌ Don't invent specific numbers or details not mentioned
❌ Don't over-elaborate with excessive procedures
❌ Don't add work that wasn't performed
❌ Don't change the core message

EXAMPLES:

Input (Portuguese): "fiz concretagem hj, usamo uns 15 metro cubico"
Output (Portuguese): "Foi realizada a concretagem da estrutura conforme planejado. A equipe executou o lançamento de aproximadamente 15 metros cúbicos de concreto usinado, com adensamento mecânico para garantir a correta acomodação. O processo seguiu as normas técnicas e procedimentos de segurança, com a equipe equipada com EPIs. Após a conclusão, iniciou-se o processo de cura do concreto."

Input (Spanish): "instalamos tuberia de agua"
Output (Spanish): "Se realizó la instalación del sistema de tubería de agua potable según especificaciones del proyecto. Se utilizaron tuberías de PVC con sus respectivos accesorios y conexiones certificadas. La instalación se ejecutó siguiendo las normas vigentes, asegurando las uniones correctamente y realizando pruebas de presión para verificar la hermeticidad del sistema."

Input (English): "painted the walls"
Output (English): "Completed the interior wall painting according to project specifications. Surface preparation was performed including cleaning and priming for optimal adhesion. Applied two coats of premium acrylic latex paint using professional-grade tools, ensuring uniform coverage. Work followed safety protocols with proper ventilation and floor protection. Final inspection confirmed quality standards were met."

Input (Portuguese): "instalei tomadas"
Output (Portuguese): "Realizou-se a instalação dos pontos de tomada conforme projeto elétrico. Foram utilizadas tomadas padrão ABNT com conexões corretas de fase, neutro e terra. A instalação seguiu as normas técnicas de segurança elétrica, e foram realizados testes de funcionamento e aterramento."

Keep it professional but concise. Return ONLY the enhanced text, no explanations.`;
    }

    static transcribeAudio() {
        return "You are transcribing a construction work report or description. The speaker may use Portuguese, Spanish, English or any other language. Transcribe EXACTLY what is said, including: technical construction terms, measurements, quantities, materials, equipment names, room/area names, worker names, dates, times, locations, and all project details. Preserve numbers, technical vocabulary, and industry jargon. Add appropriate punctuation for clarity. Capture every detail mentioned.";
    }

    static switch(
        type: string,
        serviceName?: string,
        description?: string,
        quantity?: string,
        price?: string,
        categoryName?: string
    ) {
        switch (type) {
            case "generateDescription":
                if (!serviceName || !description) {
                    throw new Error("Service name and description are required");
                }

                return this.generateDescription(serviceName, description);
            case "incrementDescription":
                if (!serviceName || !quantity || !price || !description) {
                    throw new Error("Service name, quantity, price and description are required");
                }

                return this.incrementDescription(serviceName, quantity, price, description);
            case "generateDescriptionCategory":
                if (!serviceName || !description || !categoryName) {
                    throw new Error("Service name, description and category name are required");
                }

                return this.generateDescriptionCategory(serviceName, description, categoryName);
            case "incrementDescriptionCategory":
                if (!serviceName || !description || !categoryName || !quantity || !price) {
                    throw new Error("Service name, description, category name, quantity and price are required");
                }

                return this.incrementDescriptionCategory(serviceName, description, categoryName, quantity, price);
            default:
                throw new Error("Invalid type");
        }
    }
}
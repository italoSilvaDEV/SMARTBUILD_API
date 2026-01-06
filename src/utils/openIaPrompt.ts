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

MULTILINGUAL INPUT - ENGLISH OUTPUT:
- AUTOMATICALLY DETECT the language of the user's input (Portuguese, Spanish, English, or any other language)
- ALWAYS RESPOND IN ENGLISH, regardless of the input language
- This breaks language barriers and creates a universal standard for construction reports
- Use professional construction terminology in English

FORMAT:
- Structure the output as BULLET POINTS for better readability
- Each bullet should be a complete statement
- Use • (bullet) or - (dash) for list items
- Keep it organized and scannable

YOUR TASK:
Improve the description by translating to English and making it professional with relevant technical details, but stay focused and concise.

WHAT TO ADD:
1. Correct grammar, spelling, and punctuation (in English)
2. Professional terminology and clear structure (in English)
3. Key technical specifications (materials, equipment, methods)
4. Brief mention of safety/quality standards when relevant
5. Expand to approximately 2-3x the original length (not more!)

WHAT TO KEEP:
✅ Stay close to what was actually described
✅ Preserve all original facts (quantities, locations, materials)
✅ Maintain focus on the main activity
✅ Keep the same technical meaning

WHAT TO AVOID:
❌ Don't write multiple paragraphs for simple tasks
❌ Don't invent specific numbers or details not mentioned
❌ Don't over-elaborate with excessive procedures
❌ Don't add work that wasn't performed
❌ Don't change the core message

EXAMPLES:

Input (Portuguese): "fiz concretagem hj, usamo uns 15 metro cubico"
Output (English): 
• Completed concrete pouring as planned
• Placed approximately 15 cubic meters of ready-mix concrete
• Applied mechanical vibration for proper consolidation
• Crew equipped with appropriate PPE
• Followed technical standards and safety procedures
• Initiated concrete curing process

Input (Spanish): "instalamos tuberia de agua"
Output (English):
• Installed potable water piping system per project specifications
• Used PVC pipes with certified fittings and connections
• Secured all joints following applicable standards
• Performed pressure tests to verify system integrity

Input (English): "painted the walls"
Output (English):
• Completed interior wall painting per specifications
• Prepared surfaces with cleaning and priming
• Applied two coats of premium acrylic latex paint
• Ensured uniform coverage with professional-grade tools
• Followed safety protocols with proper ventilation
• Confirmed quality standards through final inspection

Input (Portuguese): "instalei tomadas"
Output (English):
• Completed electrical outlet installation per electrical project
• Used standard outlets with proper phase, neutral, and ground connections
• Followed electrical safety technical standards
• Performed functionality and grounding tests

Input (Portuguese): "reparei o teto da área especificada"
Output (English):
• Repaired ceiling in the specified area
• Removed damaged sections
• Applied leveling compound for surface preparation
• Used acrylic paint for finishing
• Ensured surface uniformity and durability
• Maintained safe and clean work environment throughout

Keep it professional but concise. Return ONLY the bullet points in English, no explanations or headers.`;
    }

    static improveDescriptionForWorker(serviceName: string, description: string) {
        return `You are a construction project supervisor preparing clear work instructions for field workers and subcontractors. 

Your task is to improve and clarify a service description that will be sent via email to workers/subcontractors.

Service Name: "${serviceName}"
Current Description: "${description}"

CONTEXT:
- This is a work assignment from supervisor to worker/subcontractor
- The description will be sent via email
- Workers need clear, actionable instructions
- Keep the language simple and direct

REQUIREMENTS:
1. Keep it CONCISE and TO THE POINT (max 150 words)
2. Use simple, clear language that any worker can understand
3. Focus on WHAT needs to be done, not HOW to do it
4. Remove any HTML tags or technical jargon from the original
5. If the description is vague, make it more specific based on the service name
6. Organize information logically (main task → key details → important notes)

OUTPUT FORMAT:
- Write in plain text, NO HTML tags
- Use simple paragraphs or bullet points with plain text dashes (-)
- Be direct and professional but friendly
- Keep sentences short and clear

WHAT TO INCLUDE:
✓ Main work to be performed
✓ Key materials or equipment if mentioned
✓ Important specifications or requirements
✓ Any safety or quality notes if relevant

WHAT TO AVOID:
✗ Overly technical language
✗ HTML tags or formatting codes
✗ Excessive details or procedures
✗ Vague or ambiguous statements
✗ Making assumptions beyond what's stated

Return ONLY the improved description in plain text. No introductions, no explanations, just the clear work description.`;
    }

    static transcribeAudio() {
        return "You are transcribing a construction work report or description. The speaker may use Portuguese, Spanish, English or any other language. Transcribe EXACTLY what is said, including: technical construction terms, measurements, quantities, materials, equipment names, room/area names, worker names, dates, times, locations, and all project details. Preserve numbers, technical vocabulary, and industry jargon. Add appropriate punctuation for clarity. Capture every detail mentioned.";
    }

    static enhanceChangeOrderScope(currentScope: string, services: any[]) {
        const servicesJson = JSON.stringify(services, null, 2);

        const scopeContext = currentScope && currentScope.trim().length > 0 
            ? `Original Scope of Work: "${currentScope}"`
            : "No previous scope was provided. Please generate a formal introduction for this Change Order.";

        return `Act as an expert in construction contracts and project management. 
Your task is to enhance the "Scope of Work" for a Change Order (CO) document.

This Change Order document serves to officially add specific services to the project's original scope.

${scopeContext}

DATA TO BE INTEGRATED (JSON FORMAT):
${servicesJson}

INSTRUCTIONS:
1. Use a formal, professional, and direct tone.
2. Clearly explain that this Change Order document adds the services listed above to the project.
3. FOR EACH ITEM in the JSON array, create exactly ONE <li> element inside a single <ul> list.
4. DO NOT break a single service item into multiple list items or numbered lines. The name, description, and total of a single service must stay together within the same <li>.
5. Format the list item as follows: <li><strong>Service Name</strong>: Service Description (Total: $Value)</li>.
6. DO NOT invent any services, dates, or values. Use ONLY the information provided in the JSON.
7. If the original scope was provided, improve its wording and integrate the new services professionally.
8. If no previous scope was provided, start with a professional standard introduction for a Change Order.
9. The output MUST be valid HTML ready for a React Quill editor.
10. Respond ONLY with the HTML content. No conversational filler or markdown code blocks.

LANGUAGE: Respond in English.`;
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
            case "improveDescriptionForWorker":
                if (!serviceName || !description) {
                    throw new Error("Service name and description are required");
                }

                return this.improveDescriptionForWorker(serviceName, description);
            default:
                throw new Error("Invalid type");
        }
    }
}
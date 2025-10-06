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

    static transcribeAudio() {
        return "This is a construction project description. The user may speak in Portuguese, Spanish, English or other languages. Please transcribe accurately including technical construction terms, measurements, room names, materials, and project details.";
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
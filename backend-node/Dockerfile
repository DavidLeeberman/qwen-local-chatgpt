FROM node:18

# Set the working directory
WORKDIR /app

# Copy the package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the Node.js app code
COPY . .

# Expose the backend API port
EXPOSE 8000

# Run the Node.js server
CMD ["node", "server.js"]
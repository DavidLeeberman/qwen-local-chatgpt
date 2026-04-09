# Use Node 18 for building the React app
FROM node:18

# Set the working directory
WORKDIR /app

# Copy the package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the React code
COPY . .

# Expose the port React server will listen on
EXPOSE 3000

# Start the Vite development server for access from both outside and inside the docker container
CMD ["npm", "run", "dev", "--", "--host"]
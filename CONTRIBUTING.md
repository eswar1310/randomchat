# Contributing Guidelines

Thank you for your interest in contributing to this project! To maintain code quality, reproducibility, and architectural integrity, please adhere to the following guidelines.

## 🚀 Getting Started
1. Fork the repository and clone it locally.
2. Create a new branch named `feature/your-feature-name` or `bugfix/your-bugfix-name`.
3. Set up the development environment as detailed in the project's main `README.md`.

## 🛠️ Code Style & Quality
* **Python**: Adhere to PEP 8 standards. Use `black` for formatting and `flake8` or `pylint` for linting. Include typing hints on all function parameters and return types.
* **JavaScript/TypeScript**: Follow ESLint guidelines and use Prettier for formatting.
* **Documentation**: Document all public functions, classes, and REST API endpoints. If introducing new features, update the `README.md` structure accordingly.

## 🧪 Testing Requirements
* If writing a bugfix, include an automated unit or integration test that reproduces the bug and verifies its resolution.
* Ensure all tests pass locally before submitting a Pull Request.

## 📬 Pull Request Process
1. Update any dependencies in `requirements.txt` or `package.json` if required.
2. Submit a Pull Request targeting the `main` branch.
3. Reference any related issues in the PR description (e.g., "Closes #12").
4. Await code review and address any feedback promptly.
